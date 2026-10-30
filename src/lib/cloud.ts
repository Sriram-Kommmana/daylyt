import { useSyncExternalStore } from 'react';
import { mergeRows } from './backup';
import { clearLocal, db, getMeta, markDirty, onLocalChange, setMeta, TABLES, type TableName } from './db';
import type { Rec } from './types';

// The database is the source of truth; IndexedDB is a local copy that keeps the app fast and
// usable offline. Every local write joins an outbox, so nothing is lost if the network is down.

export interface RemoteRow {
  table: TableName;
  row: Rec;
  /** Server time of the write. Device clocks can't be trusted to order changes between devices. */
  syncedAt: number;
}

export interface Remote {
  /** Rows written to the server at or after this time, oldest first. */
  pull(since: number): Promise<RemoteRow[]>;
  push(rows: { table: TableName; row: Rec }[]): Promise<void>;
  wipe(): Promise<void>;
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error';
  pending: number;
  lastSyncAt: number;
  message?: string;
}

let status: SyncStatus = { state: 'idle', pending: 0, lastSyncAt: 0 };
const watchers = new Set<() => void>();
const publish = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch };
  watchers.forEach((fn) => fn());
};
export const getSyncStatus = () => status;
export const useSyncStatus = () =>
  useSyncExternalStore((fn) => { watchers.add(fn); return () => void watchers.delete(fn); }, () => status);

// Re-read a window behind the last seen write: two writes can commit slightly out of timestamp order.
const OVERLAP_MS = 5 * 60_000;

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const refreshPending = async () => publish({ pending: await db.outbox.count() });

async function pull(remote: Remote) {
  const since = (await getMeta<number>('syncedAt')) ?? 0;
  const rows = await remote.pull(Math.max(0, since - OVERLAP_MS));
  const byTable = new Map<TableName, Rec[]>();
  let latest = since;
  for (const { table, row, syncedAt } of rows) {
    if (!TABLES.includes(table)) continue;
    byTable.set(table, [...(byTable.get(table) ?? []), row]);
    latest = Math.max(latest, syncedAt);
  }
  for (const [table, incoming] of byTable) {
    const t = db[table] as unknown as { toArray(): Promise<Rec[]>; bulkPut(r: Rec[]): Promise<unknown> };
    const { toWrite } = mergeRows(await t.toArray(), incoming);
    if (toWrite.length) await t.bulkPut(toWrite);
  }
  await setMeta('syncedAt', latest);
}

async function push(remote: Remote) {
  const queued = await db.outbox.toArray();
  if (!queued.length) return;
  const sent: { key: string; table: TableName; row: Rec }[] = [];
  const stale: string[] = [];
  for (const item of queued) {
    const row = (await db[item.table].get(item.id)) as Rec | undefined;
    if (row) sent.push({ key: item.key, table: item.table, row });
    else stale.push(item.key);
  }
  if (sent.length) await remote.push(sent.map(({ table, row }) => ({ table, row })));
  // A row edited while the request was in flight must stay queued for the next round.
  const done: string[] = [...stale];
  for (const { key, table, row } of sent) {
    const now = (await db[table].get(row.id)) as Rec | undefined;
    if (!now || now.updatedAt === row.updatedAt) done.push(key);
  }
  await db.outbox.bulkDelete(done);
}

let activeRemote: Remote | null = null;
let running: Promise<void> | null = null;

/** Pulls then pushes. Overlapping calls share one run; failures are reported through status. */
export function syncNow(remote: Remote | null = activeRemote): Promise<void> {
  if (!remote) return Promise.resolve();
  if (running) return running;
  publish({ state: 'syncing', message: undefined });
  running = (async () => {
    try {
      await pull(remote);
      await push(remote);
      publish({ state: 'idle', lastSyncAt: Date.now() });
    } catch (e) {
      publish({ state: isOffline() ? 'offline' : 'error', message: e instanceof Error ? e.message : 'Sync failed' });
      throw e;
    } finally {
      await refreshPending();
      running = null;
    }
  })();
  return running;
}

/**
 * Lines this device up with the signed-in account. The first sign-in adopts whatever is already
 * here, so data logged before accounts existed moves up. Another account's data is never mixed in.
 */
export async function prepareAccount(uid: string) {
  const previous = await getMeta<string>('uid');
  if (previous === uid) return;
  if (previous) await clearLocal();
  else for (const t of TABLES) await markDirty(t, (await db[t].toArray()).map((r) => (r as Rec).id));
  await setMeta('uid', uid);
}

/** True when this device holds the user's profile, so the app can open without waiting on the network. */
export const hasLocalProfile = async () => {
  const me = await db.settings.get('me');
  return !!me && !me.deleted;
};

const PUSH_DELAY_MS = 3000;
const POLL_MS = 2 * 60_000;

/** Keeps the database current while signed in. Returns a stop function. */
export function startSync(remote: Remote) {
  activeRemote = remote;
  const attempt = () => { if (!isOffline()) syncNow(remote).catch(() => {}); };
  const flush = () => { if (!isOffline()) void push(remote).then(refreshPending).catch(() => {}); };
  let timer: ReturnType<typeof setTimeout>;
  const off = onLocalChange(() => {
    void refreshPending();
    clearTimeout(timer);
    timer = setTimeout(attempt, PUSH_DELAY_MS);
  });
  const onVisibility = () => {
    if (document.visibilityState === 'visible') attempt();
    else flush(); // Leaving the app: save now rather than risk losing the debounce window.
  };
  const onOffline = () => publish({ state: 'offline' });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', attempt);
  window.addEventListener('offline', onOffline);
  const poll = setInterval(() => { if (document.visibilityState === 'visible') attempt(); }, POLL_MS);
  attempt();
  return () => {
    off();
    clearTimeout(timer);
    clearInterval(poll);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', attempt);
    window.removeEventListener('offline', onOffline);
    activeRemote = null;
  };
}

/** Removes the local copy, as on sign-out. Everything in the database stays. */
export async function forgetDevice() {
  await clearLocal();
  publish({ state: 'idle', pending: 0, lastSyncAt: 0, message: undefined });
}

/** Permanently deletes this account's data, in the database and on this device. */
export async function deleteEverything(remote: Remote | null = activeRemote) {
  if (remote) await remote.wipe();
  await forgetDevice();
}
