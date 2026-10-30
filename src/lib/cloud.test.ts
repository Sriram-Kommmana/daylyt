import { beforeEach, describe, expect, it } from 'vitest';
import { exportSnapshot, importSnapshot } from './backup';
import { deleteEverything, forgetDevice, getSyncStatus, hasLocalProfile, prepareAccount, syncNow, type Remote, type RemoteRow } from './cloud';
import { clearLocal, db, defaultSettings, remove, save } from './db';
import { isPR, lastSets, personalRecords, plansOn, workoutTitle } from './workouts';
import { plansToIcs } from '../pages/Plan';
import type { Plan, Settings, WaterLog, Workout } from './types';

/** An in-memory database. The clock is the server's, independent of any device. */
function fakeDatabase() {
  const docs = new Map<string, RemoteRow>();
  let clock = 1_000_000;
  let down = false;
  const stats = { pulls: 0, pushed: 0, lastSince: -1 };
  const remote: Remote = {
    async pull(since) {
      if (down) throw new Error('offline');
      stats.pulls += 1;
      stats.lastSince = since;
      return [...docs.values()].filter((d) => d.syncedAt >= since).sort((a, b) => a.syncedAt - b.syncedAt);
    },
    async push(rows) {
      if (down) throw new Error('offline');
      for (const { table, row } of rows) {
        clock += 1000;
        docs.set(`${table}__${row.id}`, { table, row: JSON.parse(JSON.stringify(row)), syncedAt: clock });
      }
      stats.pushed += rows.length;
    },
    async wipe() {
      if (down) throw new Error('offline');
      docs.clear();
    },
  };
  return { remote, docs, stats, setDown: (v: boolean) => { down = v; } };
}

/** Clearing cookies or site data: everything in this browser disappears. */
const clearBrowser = clearLocal;

const water = (id: string, ml: number) => save<WaterLog>('water', { id, date: '2026-01-01', ml, at: 1 });
const onboard = () => save<Settings>('settings', { ...defaultSettings(), name: 'Asha', onboarded: true });

let cloud: ReturnType<typeof fakeDatabase>;
beforeEach(async () => {
  await clearBrowser();
  cloud = fakeDatabase();
});

describe('saving to the database', () => {
  it('sends new entries up and empties the queue', async () => {
    await prepareAccount('u1');
    await water('a', 250);
    expect(await db.outbox.count()).toBe(1);
    await syncNow(cloud.remote);
    expect(cloud.docs.get('water__a')?.row).toMatchObject({ ml: 250 });
    expect(await db.outbox.count()).toBe(0);
    expect(getSyncStatus().state).toBe('idle');
  });

  it('survives clearing the browser: signing in brings everything back', async () => {
    await prepareAccount('u1');
    await onboard();
    await water('a', 250);
    await syncNow(cloud.remote);

    await clearBrowser();
    expect(await db.water.count()).toBe(0);
    expect(await hasLocalProfile()).toBe(false);

    await prepareAccount('u1');
    await syncNow(cloud.remote);
    expect((await db.water.get('a'))?.ml).toBe(250);
    expect((await db.settings.get('me'))?.name).toBe('Asha');
    expect(await hasLocalProfile()).toBe(true);
  });

  it('keeps offline entries queued and saves them when the connection returns', async () => {
    await prepareAccount('u1');
    cloud.setDown(true);
    await water('a', 250);
    await expect(syncNow(cloud.remote)).rejects.toThrow();
    expect(await db.outbox.count()).toBe(1);
    expect(getSyncStatus().pending).toBe(1);
    expect(getSyncStatus().state).toBe('error');

    cloud.setDown(false);
    await syncNow(cloud.remote);
    expect(cloud.docs.has('water__a')).toBe(true);
    expect(getSyncStatus().pending).toBe(0);
  });

  it('does not re-send what is already saved', async () => {
    await prepareAccount('u1');
    await water('a', 250);
    await syncNow(cloud.remote);
    const before = cloud.stats.pushed;
    await syncNow(cloud.remote);
    expect(cloud.stats.pushed).toBe(before);
  });

  it('only asks the database for recent changes after the first sync', async () => {
    await prepareAccount('u1');
    await water('a', 250);
    await syncNow(cloud.remote);
    await water('b', 250);
    await syncNow(cloud.remote);
    await syncNow(cloud.remote);
    expect(cloud.stats.lastSince).toBeGreaterThan(0);
  });
});

describe('two devices', () => {
  /** Switches to the other device's local storage. */
  async function asDevice(store: { rows?: Awaited<ReturnType<typeof exportSnapshot>> }, fn: () => Promise<void>) {
    await clearBrowser();
    await prepareAccount('u1');
    if (store.rows) await importSnapshot(store.rows);
    await db.outbox.clear();
    await fn();
    store.rows = await exportSnapshot();
  }

  it('shows each device the other one\'s entries', async () => {
    const phone = {};
    const laptop = {};
    await asDevice(phone, async () => { await water('fromPhone', 100); await syncNow(cloud.remote); });
    await asDevice(laptop, async () => { await syncNow(cloud.remote); await water('fromLaptop', 200); await syncNow(cloud.remote); });
    await asDevice(phone, async () => {
      await syncNow(cloud.remote);
      expect((await db.water.get('fromLaptop'))?.ml).toBe(200);
      expect((await db.water.get('fromPhone'))?.ml).toBe(100);
    });
  });

  it('carries a delete across instead of bringing the entry back', async () => {
    await prepareAccount('u1');
    await water('a', 250);
    await syncNow(cloud.remote);
    await remove('water', 'a');
    await syncNow(cloud.remote);
    await clearBrowser();
    await prepareAccount('u1');
    await syncNow(cloud.remote);
    expect((await db.water.get('a'))?.deleted).toBe(1);
  });

  it('keeps the newer edit when both devices change the same entry', async () => {
    await prepareAccount('u1');
    await water('a', 100);
    await syncNow(cloud.remote);
    await new Promise((r) => setTimeout(r, 5));
    // Another device saves a newer value while this one is holding an older copy.
    cloud.docs.set('water__a', { table: 'water', row: { id: 'a', updatedAt: Date.now() + 5000, date: '2026-01-01', ml: 999, at: 1 } as WaterLog, syncedAt: 9_000_000 });
    await syncNow(cloud.remote);
    expect((await db.water.get('a'))?.ml).toBe(999);
  });

  it('finds a change from a device whose clock is far behind', async () => {
    await prepareAccount('u1');
    await water('a', 100);
    await syncNow(cloud.remote);
    // The row claims a time long ago, but the server received it just now.
    cloud.docs.set('water__late', { table: 'water', row: { id: 'late', updatedAt: 5, date: '2026-01-01', ml: 321, at: 1 } as WaterLog, syncedAt: 9_000_000 });
    await syncNow(cloud.remote);
    expect((await db.water.get('late'))?.ml).toBe(321);
  });
});

describe('accounts', () => {
  it('moves up data logged on this device before the first sign-in', async () => {
    await save<WaterLog>('water', { id: 'old', date: '2026-01-01', ml: 500, at: 1 });
    await db.outbox.clear(); // As on a device from before the outbox existed.
    await prepareAccount('u1');
    await syncNow(cloud.remote);
    expect(cloud.docs.get('water__old')?.row).toMatchObject({ ml: 500 });
  });

  it('never mixes a different account\'s data into this one', async () => {
    await prepareAccount('u1');
    await water('private', 250);
    await syncNow(cloud.remote);
    await prepareAccount('u2');
    expect(await db.water.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('leaves the database intact when signing out removes the local copy', async () => {
    await prepareAccount('u1');
    await water('a', 250);
    await syncNow(cloud.remote);
    await forgetDevice();
    expect(await db.water.count()).toBe(0);
    expect(cloud.docs.size).toBe(1);
  });

  it('deletes everything everywhere on request', async () => {
    await prepareAccount('u1');
    await water('a', 250);
    await syncNow(cloud.remote);
    await deleteEverything(cloud.remote);
    expect(cloud.docs.size).toBe(0);
    expect(await db.water.count()).toBe(0);
  });

  it('keeps local data if the database delete fails', async () => {
    await prepareAccount('u1');
    await water('a', 250);
    cloud.setDown(true);
    await expect(deleteEverything(cloud.remote)).rejects.toThrow();
    expect(await db.water.count()).toBe(1);
  });
});

describe('backup files', () => {
  it('round-trips every table, and restored rows reach the database', async () => {
    await prepareAccount('u1');
    await water('a', 250);
    await save<Plan>('plans', { id: 'p', kind: 'other', title: 'x', date: '2026-01-01', doneDates: [], skipDates: [] });
    const file = JSON.parse(JSON.stringify(await exportSnapshot()));
    await clearBrowser();
    await prepareAccount('u1');
    expect(await importSnapshot(file)).toBe(2);
    await syncNow(cloud.remote);
    expect(cloud.docs.get('water__a')?.row).toMatchObject({ ml: 250 });
    expect((await db.plans.get('p'))?.title).toBe('x');
  });
  it('never overwrites newer local data with an old backup', async () => {
    await water('a', 250);
    const old = JSON.parse(JSON.stringify(await exportSnapshot()));
    await new Promise((r) => setTimeout(r, 5));
    await water('a', 999);
    await importSnapshot(old);
    expect((await db.water.get('a'))?.ml).toBe(999);
  });
});

describe('workout history', () => {
  const lift = (id: string, date: string, weight: number, reps = 5): Workout => ({
    id, updatedAt: 0, date, name: '', exercises: [{ exerciseId: 'bench', name: 'Bench', kind: 'reps', category: 'strength', primary: ['chest'], sets: [{ reps, weight, done: true }] }],
  });
  const all = [lift('w1', '2026-01-01', 60), lift('w2', '2026-01-08', 70), lift('w3', '2026-01-15', 65)];
  it('finds the most recent earlier sets, skipping the current workout', () => {
    expect(lastSets(all, 'bench', '2026-01-15', 'w3')?.[0].weight).toBe(70);
    expect(lastSets(all, 'bench', '2026-01-01', 'w1')).toBeUndefined();
  });
  it('keeps the best estimated one-rep max per exercise', () => {
    const [pr] = personalRecords(all);
    expect(pr.weight).toBe(70);
    expect(pr.date).toBe('2026-01-08');
  });
  it('flags a set as a PR only when it beats earlier history', () => {
    const set = (weight: number) => ({ reps: 5, weight, done: true });
    expect(isPR(all, 'new', '2026-01-20', 'bench', set(75))).toBe(true);
    expect(isPR(all, 'new', '2026-01-20', 'bench', set(70))).toBe(false);
    expect(isPR([], 'new', '2026-01-20', 'bench', set(200))).toBe(false); // first time isn't a record yet
    expect(isPR(all, 'new', '2026-01-20', 'bench', { ...set(99), done: false })).toBe(false);
  });
  it('names an unnamed workout after what it trained', () => {
    expect(workoutTitle(all[0])).toBe('Chest');
    expect(workoutTitle({ name: 'Leg day', exercises: [] })).toBe('Leg day');
    expect(workoutTitle({ name: '', exercises: [] })).toBe('Workout');
  });
});

describe('calendar export', () => {
  const base = { updatedAt: 0, doneDates: [], skipDates: [] };
  it('writes a repeating event with a reminder when it has a time', () => {
    const ics = plansToIcs([{ ...base, id: 'p', kind: 'workout', title: 'Push, heavy', time: '18:30', weekdays: [1, 4], from: '2026-11-02' }]);
    expect(ics).toContain('DTSTART:20261102T183000');
    expect(ics).toContain('DTEND:20261102T193000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,TH');
    expect(ics).toContain('SUMMARY:Push\\, heavy');
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics.split('\r\n').length).toBeGreaterThan(5);
  });
  it('writes an all-day event when it has no time', () => {
    const ics = plansToIcs([{ ...base, id: 'p', kind: 'other', title: 'Rest', date: '2026-12-25' }]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261225');
    expect(ics).not.toContain('RRULE');
  });
  it('sorts the day by time, with untimed items last', () => {
    const p = (id: string, time?: string): Plan => ({ ...base, id, kind: 'other', title: id, date: '2026-01-01', time });
    expect(plansOn([p('c'), p('b', '18:00'), p('a', '07:00')], '2026-01-01').map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});
