import { db, markDirty, TABLES, type TableName } from './db';
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

/** Restores a backup file. Restored rows are queued so they also reach the database. */
export async function importSnapshot(snapshot: Snapshot) {
  validateSnapshot(snapshot);
  let count = 0;
  for (const t of TABLES) {
    const incoming = snapshot.tables[t];
    if (!Array.isArray(incoming)) continue;
    const local = (await db[t].toArray()) as Rec[];
    const { toWrite } = mergeRows(local, incoming);
    if (toWrite.length) {
      await (db[t] as unknown as { bulkPut(r: Rec[]): Promise<unknown> }).bulkPut(toWrite);
      await markDirty(t, toWrite.map((r) => r.id));
    }
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
