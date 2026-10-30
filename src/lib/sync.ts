import { db, onLocalChange, TABLES, type TableName } from './db';
import type { Rec } from './types';

export type Snapshot = { app: 'daylyt'; version: 1; exportedAt: number; tables: Partial<Record<TableName, Rec[]>> };

export async function exportSnapshot(): Promise<Snapshot> {
  const tables: Snapshot['tables'] = {};
  for (const t of TABLES) tables[t] = (await db[t].toArray()) as Rec[];
  return { app: 'daylyt', version: 1, exportedAt: Date.now(), tables };
}

/** Last write wins, per row. Pure, so it can be tested without a database. */
export function mergeRows(local: Rec[], remote: Rec[]) {
  const merged = new Map(local.map((r) => [r.id, r]));
  const toWrite: Rec[] = [];
  for (const r of remote) {
    if (!r || typeof r.id !== 'string') continue;
    const mine = merged.get(r.id);
    if (!mine || (r.updatedAt ?? 0) > (mine.updatedAt ?? 0)) {
      merged.set(r.id, r);
      toWrite.push(r);
    }
  }
  return { merged: [...merged.values()], toWrite };
}

export function validateSnapshot(data: unknown): asserts data is Snapshot {
  const s = data as Snapshot;
  if (!s || s.app !== 'daylyt' || typeof s.tables !== 'object') throw new Error('This is not a Daylyt backup file.');
}

export async function importSnapshot(snapshot: Snapshot) {
  validateSnapshot(snapshot);
  let count = 0;
  for (const t of TABLES) {
    const incoming = snapshot.tables[t];
    if (!Array.isArray(incoming)) continue;
    const local = (await db[t].toArray()) as Rec[];
    const { toWrite } = mergeRows(local, incoming);
    if (toWrite.length) await (db[t] as unknown as { bulkPut(r: Rec[]): Promise<unknown> }).bulkPut(toWrite);
    count += toWrite.length;
  }
  return count;
}

export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------------------------
// Optional device sync through a secret GitHub Gist the user owns. There is no Daylyt server:
// the browser talks straight to GitHub with the user's token, and the token stays on the device.
// ---------------------------------------------------------------------------------------------

const FILE = 'daylyt-data.json';
const DESCRIPTION = 'Daylyt sync data';
const API = 'https://api.github.com';
const TOKEN_KEY = 'daylyt-gist-token';
const GIST_KEY = 'daylyt-gist-id';
const LAST_KEY = 'daylyt-last-sync';

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

export const syncConfigured = () => !!ls.get(TOKEN_KEY);
export const lastSync = () => Number(ls.get(LAST_KEY) ?? 0);

async function gh(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) throw new Error('GitHub rejected this token. Check it has not expired.');
  if (res.status === 403 || res.status === 404) throw new Error('This token cannot access gists. It needs the "gist" permission.');
  if (!res.ok) throw new Error(`GitHub returned an error (${res.status}).`);
  return res.json();
}

async function findGist(token: string): Promise<string | null> {
  for (let page = 1; page <= 5; page++) {
    const list = (await gh(`/gists?per_page=100&page=${page}`, token)) as { id: string; files: Record<string, unknown> }[];
    const hit = list.find((g) => g.files?.[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return null;
}

async function readRemote(token: string, gistId: string): Promise<Snapshot | null> {
  const gist = await gh(`/gists/${gistId}`, token);
  const file = gist.files?.[FILE];
  if (!file) return null;
  // GitHub truncates large files in the API response; the raw URL always has the whole thing.
  const text = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
  const parsed = JSON.parse(text);
  validateSnapshot(parsed);
  return parsed;
}

const payload = async () => JSON.stringify({ files: { [FILE]: { content: JSON.stringify(await exportSnapshot()) } } });

let running: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const token = ls.get(TOKEN_KEY);
    if (!token) throw new Error('Sync is not set up.');
    let gistId = ls.get(GIST_KEY) ?? (await findGist(token));
    if (gistId) {
      const remote = await readRemote(token, gistId);
      if (remote) await importSnapshot(remote);
      await gh(`/gists/${gistId}`, token, { method: 'PATCH', body: await payload() });
    } else {
      const created = await gh('/gists', token, {
        method: 'POST',
        body: JSON.stringify({ description: DESCRIPTION, public: false, files: JSON.parse(await payload()).files }),
      });
      gistId = created.id as string;
    }
    ls.set(GIST_KEY, gistId);
    ls.set(LAST_KEY, String(Date.now()));
  })().finally(() => { running = null; });
  return running;
}

export async function connectSync(token: string) {
  ls.set(TOKEN_KEY, token.trim());
  ls.del(GIST_KEY);
  try {
    await syncNow();
  } catch (e) {
    ls.del(TOKEN_KEY);
    throw e;
  }
}

export const disconnectSync = () => {
  [TOKEN_KEY, GIST_KEY, LAST_KEY].forEach(ls.del);
};

/** Pull on launch, and push a few seconds after the last local change. Failures stay quiet and retry next time. */
export function startAutoSync() {
  const attempt = () => { if (syncConfigured() && navigator.onLine) syncNow().catch(() => {}); };
  attempt();
  let timer: ReturnType<typeof setTimeout>;
  const off = onLocalChange(() => {
    clearTimeout(timer);
    timer = setTimeout(attempt, 5000);
  });
  const onVisible = () => { if (document.visibilityState === 'visible') attempt(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', attempt);
  return () => {
    off();
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', attempt);
  };
}
