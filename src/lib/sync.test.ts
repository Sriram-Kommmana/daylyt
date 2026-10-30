import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, remove, save, TABLES } from './db';
import { connectSync, disconnectSync, exportSnapshot, importSnapshot, syncConfigured, syncNow } from './sync';
import { isPR, lastSets, personalRecords, plansOn, workoutTitle } from './workouts';
import { plansToIcs } from '../pages/Plan';
import type { Plan, WaterLog, Workout } from './types';

// One browser's localStorage. Swapped out to simulate a second device.
let storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});

/** A minimal stand-in for the GitHub Gist API, including its truncation of large files. */
function fakeGitHub(token: string) {
  const gists = new Map<string, { id: string; files: Record<string, { content: string }> }>();
  const calls: { method: string; url: string; auth: string | null; public?: boolean }[] = [];
  let truncate = false;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const view = (g: { id: string; files: Record<string, { content: string }> }) => ({
    id: g.id,
    files: Object.fromEntries(Object.entries(g.files).map(([name, f]) => [name, truncate
      ? { content: f.content.slice(0, 10), truncated: true, raw_url: `https://raw.example/${g.id}` }
      : { content: f.content, truncated: false }])),
  });
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const auth = new Headers(init.headers).get('Authorization');
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url, auth, public: body?.public });
    if (url.startsWith('https://raw.example/')) return new Response([...gists.values()][0].files['daylyt-data.json'].content);
    if (auth !== `Bearer ${token}`) return json({ message: 'Bad credentials' }, 401);
    const path = url.replace('https://api.github.com', '');
    if (method === 'GET' && path.startsWith('/gists?')) return json([...gists.values()].map(view));
    if (method === 'POST' && path === '/gists') {
      const id = `gist${gists.size + 1}`;
      const g = { id, files: body.files };
      gists.set(id, g);
      return json(view(g), 201);
    }
    const g = gists.get(path.replace('/gists/', ''));
    if (!g) return json({ message: 'Not found' }, 404);
    if (method === 'PATCH') g.files = { ...g.files, ...body.files };
    return json(view(g));
  });
  return { fetchMock, calls, gists, setTruncate: (v: boolean) => { truncate = v; } };
}

async function wipeDevice() {
  await Promise.all(TABLES.map((t) => db[t].clear()));
  storage = new Map();
}

const water = (id: string, ml: number) => save<WaterLog>('water', { id, date: '2026-01-01', ml, at: 1 });

describe('sync between two devices', () => {
  let gh: ReturnType<typeof fakeGitHub>;
  beforeEach(async () => {
    await wipeDevice();
    gh = fakeGitHub('tok');
    vi.stubGlobal('fetch', gh.fetchMock);
  });

  it('creates a secret gist and sends the token only to GitHub', async () => {
    await water('a', 250);
    await connectSync('  tok  ');
    expect(gh.gists.size).toBe(1);
    const created = gh.calls.find((c) => c.method === 'POST')!;
    expect(created.public).toBe(false);
    expect(gh.calls.every((c) => c.url.startsWith('https://api.github.com'))).toBe(true);
    expect(syncConfigured()).toBe(true);
  });

  it('brings data to a new device with the same token, without creating a second gist', async () => {
    await water('a', 250);
    await connectSync('tok');
    await wipeDevice();
    await connectSync('tok');
    expect(gh.gists.size).toBe(1);
    expect((await db.water.get('a'))?.ml).toBe(250);
  });

  it('merges edits made on both devices', async () => {
    await water('fromA', 100);
    await connectSync('tok');
    const deviceA = new Map(storage);
    const rowsA = await exportSnapshot();

    await wipeDevice();
    await connectSync('tok');
    await water('fromB', 200);
    await syncNow();

    await wipeDevice();
    storage = deviceA;
    await importSnapshot(rowsA);
    await syncNow();
    expect((await db.water.get('fromA'))?.ml).toBe(100);
    expect((await db.water.get('fromB'))?.ml).toBe(200);
  });

  it('carries a delete across devices instead of bringing the row back', async () => {
    await water('a', 250);
    await connectSync('tok');
    await remove('water', 'a');
    await syncNow();
    await wipeDevice();
    await connectSync('tok');
    expect((await db.water.get('a'))?.deleted).toBe(1);
  });

  it('reads the full file when GitHub truncates it', async () => {
    await water('a', 250);
    await connectSync('tok');
    gh.setTruncate(true);
    await wipeDevice();
    await connectSync('tok');
    expect((await db.water.get('a'))?.ml).toBe(250);
    expect(gh.calls.some((c) => c.url.startsWith('https://raw.example/'))).toBe(true);
  });

  it('forgets a bad token and reports why', async () => {
    await expect(connectSync('wrong')).rejects.toThrow(/rejected this token/);
    expect(syncConfigured()).toBe(false);
  });

  it('turns off cleanly', async () => {
    await connectSync('tok');
    disconnectSync();
    expect(syncConfigured()).toBe(false);
    await expect(syncNow()).rejects.toThrow(/not set up/);
  });
});

describe('backup files', () => {
  beforeEach(wipeDevice);
  it('round-trips every table through export and import', async () => {
    await water('a', 250);
    await save<Plan>('plans', { id: 'p', kind: 'other', title: 'x', date: '2026-01-01', doneDates: [], skipDates: [] });
    const file = JSON.parse(JSON.stringify(await exportSnapshot()));
    await wipeDevice();
    expect(await importSnapshot(file)).toBe(2);
    expect((await db.water.get('a'))?.ml).toBe(250);
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
