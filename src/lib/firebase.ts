import { useEffect, useState } from 'react';
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  createUserWithEmailAndPassword, getAuth, GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut, type User,
} from 'firebase/auth';
import {
  collection, doc, getDocs, getFirestore, limit, orderBy, query, serverTimestamp, startAfter, Timestamp, where, writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import type { Remote, RemoteRow } from './cloud';
import type { TableName } from './db';

// These values identify the project; they are not secrets. Google's docs say they are safe to
// publish, because access is controlled by firestore.rules, which requires a signed-in owner.
const PRODUCTION: FirebaseOptions = {
  apiKey: 'AIzaSyBtdK4P8F_9zbmDDeNjYR9SKYV51Vu_-Xw',
  authDomain: 'daylyt-tracker-s8pad.firebaseapp.com',
  projectId: 'daylyt-tracker-s8pad',
  appId: '1:1009288585285:web:41654e450613a5aec0432c',
};

export const isConfigured = !!PRODUCTION.projectId;

const app = isConfigured ? initializeApp(PRODUCTION) : null;
const auth = app ? getAuth(app) : null;
const firestore = app ? getFirestore(app) : null;

/** undefined while the saved session loads, null when signed out. Works offline. */
export function useUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : setUser(null)), []);
  return user;
}

export const signInWithGoogle = () => signInWithPopup(auth!, new GoogleAuthProvider());
export const signInWithEmail = (email: string, password: string) => signInWithEmailAndPassword(auth!, email, password);
export const createAccount = (email: string, password: string) => createUserWithEmailAndPassword(auth!, email, password);
export const resetPassword = (email: string) => sendPasswordResetEmail(auth!, email);
export const signOut = () => fbSignOut(auth!);
export const currentEmail = () => auth?.currentUser?.email ?? '';

export function authErrorMessage(e: unknown) {
  const code = (e as { code?: string })?.code ?? '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'That email or password is not right.',
    'auth/wrong-password': 'That email or password is not right.',
    'auth/user-not-found': 'That email or password is not right.',
    'auth/email-already-in-use': 'An account already uses this email. Sign in instead.',
    'auth/weak-password': 'Use a password of at least 6 characters.',
    'auth/invalid-email': 'That email address does not look right.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site, or use email and password.',
    'auth/popup-closed-by-user': 'The Google window was closed before signing in finished.',
    'auth/cancelled-popup-request': 'The Google window was closed before signing in finished.',
    'auth/network-request-failed': 'No connection. You need to be online to sign in.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/unauthorized-domain': 'This web address is not yet allowed to sign in.',
    'auth/admin-restricted-operation': 'New accounts are switched off for this app.',
  };
  return messages[code] ?? 'Could not sign in. Please try again.';
}

const PAGE = 500;
const BATCH = 400;

/** Stores each row as one document, under the signed-in user's own path. */
export function firestoreRemote(uid: string): Remote {
  const rows = collection(firestore!, 'users', uid, 'rows');
  const docId = (table: TableName, id: string) => `${table}__${encodeURIComponent(id)}`;

  return {
    async pull(since) {
      const out: RemoteRow[] = [];
      let cursor: QueryDocumentSnapshot | undefined;
      for (;;) {
        const base = [where('syncedAt', '>=', Timestamp.fromMillis(since)), orderBy('syncedAt'), limit(PAGE)];
        const snap = await getDocs(query(rows, ...base, ...(cursor ? [startAfter(cursor)] : [])));
        for (const d of snap.docs) {
          const data = d.data();
          out.push({ table: data.table, row: JSON.parse(data.json), syncedAt: data.syncedAt?.toMillis?.() ?? 0 });
        }
        if (snap.docs.length < PAGE) return out;
        cursor = snap.docs[snap.docs.length - 1];
      }
    },
    async push(items) {
      for (let i = 0; i < items.length; i += BATCH) {
        const batch = writeBatch(firestore!);
        for (const { table, row } of items.slice(i, i + BATCH)) {
          // JSON keeps the row exactly as the app wrote it, and skips Firestore's limits on nesting.
          batch.set(doc(rows, docId(table, row.id)), { table, id: row.id, updatedAt: row.updatedAt, json: JSON.stringify(row), syncedAt: serverTimestamp() });
        }
        await batch.commit();
      }
    },
    async wipe() {
      for (;;) {
        const snap = await getDocs(query(rows, limit(BATCH)));
        if (snap.empty) return;
        const batch = writeBatch(firestore!);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    },
  };
}
