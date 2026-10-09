/**
 * Object numbers handed to editing sessions: the counter, sessions and
 * blocks (migration 032), on SQLite. The races between replicas are in
 * object-numbers-replicas.test.ts.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import { EngineErrorCode, OBJECT_NUMBER_ISSUE_LIMIT } from '@embedpdf/engine-core/runtime';
import {
  DocumentsRepo,
  LayersRepo,
  createSqliteDb,
  migrate,
  sqliteMigrations,
  type DbSchema,
} from '../src/index';
import {
  EDIT_SESSION_LIFETIME_MS,
  ObjectNumberService,
  type EditSessionKey,
} from '../src/services/ObjectNumberService';

const TENANT = 'tenant-numbers';
const DOC = 'doc-numbers';
const BASE = 'a'.repeat(64);

let db: Kysely<DbSchema>;
let clock: number;
let numbers: ObjectNumberService;
let layerId: string;

const session = (sessionId: string, sub = 'user-1'): EditSessionKey => ({
  layerId,
  sessionId,
  sub,
});

beforeEach(async () => {
  db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const documents = new DocumentsRepo(db);
  await documents.createPending({
    id: DOC,
    tenantId: TENANT,
    metadata: null,
    idempotencyKey: null,
    createdBy: null,
  });
  await documents.commit({ id: DOC, tenantId: TENANT, baseSha: BASE, storageSizeBytes: 1 });
  const layer = await new LayersRepo(db).createEmpty({
    id: 'layer-1',
    docId: DOC,
    tenantId: TENANT,
    name: 'default',
    baseSha: BASE,
  });
  layerId = layer.id;
  clock = 1_000_000;
  numbers = new ObjectNumberService({ db, now: () => clock });
  // The engine opened the layer: its last object is 99.
  await numbers.startCounter(db, layerId, 99);
});

afterEach(async () => {
  await db.destroy();
});

const counter = async () =>
  Number(
    (await db.selectFrom('layers').select('next_object_number').executeTakeFirstOrThrow())
      .next_object_number,
  );

describe('the counter', () => {
  test('starts once, past what the engine reports', async () => {
    expect(await counter()).toBe(100);
    await numbers.startCounter(db, layerId, 500);
    expect(await counter()).toBe(100);
  });
});

describe('sessions', () => {
  test('a session is made, kept alive past half its life, revived, and stays its subject’s', async () => {
    expect(await numbers.touchSession(db, session('s1'))).toEqual({
      state: 'new',
      expiresIn: EDIT_SESSION_LIFETIME_MS,
    });
    clock += 1_000;
    expect(await numbers.touchSession(db, session('s1'))).toEqual({
      state: 'live',
      expiresIn: EDIT_SESSION_LIFETIME_MS - 1_000,
    });
    clock += EDIT_SESSION_LIFETIME_MS / 2;
    expect((await numbers.touchSession(db, session('s1'))).expiresIn).toBe(
      EDIT_SESSION_LIFETIME_MS,
    );
    clock += EDIT_SESSION_LIFETIME_MS + 1;
    expect((await numbers.touchSession(db, session('s1'))).state).toBe('revived');
    await expect(numbers.touchSession(db, session('s1', 'someone-else'))).rejects.toMatchObject({
      code: EngineErrorCode.Forbidden,
    });
  });
});

describe('handing numbers out', () => {
  test('fresh numbers come from the counter, in blocks the session holds', async () => {
    await numbers.touchSession(db, session('s1'));
    expect(await numbers.issue(db, session('s1'), 40)).toEqual(
      Array.from({ length: 40 }, (_, i) => 100 + i),
    );
    expect(await numbers.held(db, session('s1'))).toEqual([{ first: 100, count: 40 }]);
    await numbers.touchSession(db, session('s2'));
    expect(await numbers.issue(db, session('s2'), 8)).toEqual(
      Array.from({ length: 8 }, (_, i) => 140 + i),
    );
    expect(await counter()).toBe(148);
  });

  test("an expired session's unspent numbers go to the next session first", async () => {
    await numbers.touchSession(db, session('a'));
    await numbers.issue(db, session('a'), 36);
    await numbers.spend(db, session('a'), [100, 101, 102]);
    clock += EDIT_SESSION_LIFETIME_MS + 1;

    await numbers.touchSession(db, session('b'));
    const issued = await numbers.issue(db, session('b'), 36);
    expect(issued).toHaveLength(36);
    expect(issued.slice(0, 33)).toEqual(Array.from({ length: 33 }, (_, i) => 103 + i));
    expect(await counter()).toBe(139); // moved by 3
    expect(await numbers.held(db, session('a'))).toEqual([]);
    // Handed on: a late write of the expired session is refused, not revived.
    await expect(numbers.assertHeld(db, session('a'), [103])).rejects.toMatchObject({
      details: { objectNumber: 103, reason: 'not-held' },
    });
  });

  test('blocks a write gave back go before expired sessions’ and the counter', async () => {
    const range = await numbers.reserveForWrite(layerId, BASE, 64);
    await numbers.touchSession(db, session('s1'));
    await numbers.issue(db, session('s1'), 8); // the counter moved past the write's range
    await numbers.releaseWrite(layerId, range);

    // A block moves whole: asking for 10 takes one returned block of 32.
    await numbers.touchSession(db, session('s2'));
    expect(await numbers.issue(db, session('s2'), 10)).toEqual(
      Array.from({ length: 32 }, (_, i) => 100 + i),
    );
  });

  test('fresh numbers stop at the issue limit; reclaimed ones still go out', async () => {
    await db
      .updateTable('layers')
      .set({ next_object_number: OBJECT_NUMBER_ISSUE_LIMIT - 1 })
      .execute();
    await numbers.touchSession(db, session('s1'));
    expect(await numbers.issue(db, session('s1'), 8)).toEqual([
      OBJECT_NUMBER_ISSUE_LIMIT - 1,
      OBJECT_NUMBER_ISSUE_LIMIT,
    ]);
    expect(await numbers.issue(db, session('s1'), 8)).toEqual([]);
  });

  test('expired sessions without blocks are tidied away', async () => {
    await numbers.touchSession(db, session('idle'));
    clock += EDIT_SESSION_LIFETIME_MS + 1;
    await numbers.touchSession(db, session('s1'));
    await numbers.issue(db, session('s1'), 1);
    expect(await db.selectFrom('edit_sessions').select('session_id').execute()).toEqual([
      { session_id: 's1' },
    ]);
  });
});

describe('writes', () => {
  test('a write may name only numbers its session holds and has not spent', async () => {
    await numbers.touchSession(db, session('s1'));
    await numbers.touchSession(db, session('s2'));
    const [mine] = await numbers.issue(db, session('s1'), 1);
    const [theirs] = await numbers.issue(db, session('s2'), 1);

    await numbers.assertHeld(db, session('s1'), [mine!]);
    for (const [key, number] of [
      [session('s1'), theirs!],
      [session('s1'), 5_000],
      [session('s1', 'someone-else'), mine!],
      [session('unknown'), mine!],
    ] as const) {
      await expect(numbers.assertHeld(db, key, [number])).rejects.toMatchObject({
        code: EngineErrorCode.ObjectNumberUnavailable,
        details: { objectNumber: number, reason: 'not-held' },
      });
    }
    await numbers.spend(db, session('s1'), [mine!]);
    await expect(numbers.assertHeld(db, session('s1'), [mine!])).rejects.toMatchObject({
      details: { reason: 'not-held' },
    });
    await expect(numbers.spend(db, session('s1'), [mine!])).rejects.toMatchObject({
      details: { reason: 'not-held' },
    });
  });

  test('a number in a block that starts just past a smaller one is found', async () => {
    await numbers.touchSession(db, session('s1'));
    await numbers.issue(db, session('s1'), 8); // 100..107
    const range = await numbers.reserveForWrite(layerId, BASE, 64);
    await numbers.settleWrite(db, layerId, range, 109); // the counter comes back to 110
    expect(await numbers.issue(db, session('s1'), 4)).toEqual([110, 111, 112, 113]);

    await numbers.assertHeld(db, session('s1'), [107, 110]);
    await numbers.spend(db, session('s1'), [107, 110]);
    expect(await numbers.held(db, session('s1'))).toEqual([
      { first: 100, count: 7 },
      { first: 111, count: 3 },
    ]);
  });

  test('an expired session whose blocks nobody took is revived by its write', async () => {
    await numbers.touchSession(db, session('s1'));
    const [mine] = await numbers.issue(db, session('s1'), 1);
    clock += EDIT_SESSION_LIFETIME_MS + 1;
    await numbers.assertHeld(db, session('s1'), [mine!]);
    expect((await numbers.findSession(db, session('s1')))!.expiresIn).toBe(
      EDIT_SESSION_LIFETIME_MS,
    );
  });

  test('a write settles its range: the counter comes back when nobody moved it', async () => {
    const range = await numbers.reserveForWrite(layerId, BASE, 64);
    expect(range).toEqual({ floor: 100, end: 164, baseSha: BASE });
    expect(await numbers.settleWrite(db, layerId, range, 102)).toBe('settled');
    expect(await counter()).toBe(103);
  });

  test('a write that needed more than its estimate moves the counter past it', async () => {
    const range = await numbers.reserveForWrite(layerId, BASE, 64);
    expect(await numbers.settleWrite(db, layerId, range, 199)).toBe('settled');
    expect(await counter()).toBe(200);
  });

  test("when numbers went out meanwhile, a write's unused part becomes free blocks", async () => {
    const range = await numbers.reserveForWrite(layerId, BASE, 64);
    await numbers.touchSession(db, session('s1'));
    await numbers.issue(db, session('s1'), 8);
    expect(await numbers.settleWrite(db, layerId, range, 109)).toBe('settled');
    expect(await counter()).toBe(172);
    await numbers.touchSession(db, session('s2'));
    expect((await numbers.issue(db, session('s2'), 1))[0]).toBe(110);
  });

  test('a write that overran numbers handed out meanwhile runs again', async () => {
    const range = await numbers.reserveForWrite(layerId, BASE, 64);
    await numbers.touchSession(db, session('s1'));
    await numbers.issue(db, session('s1'), 8);
    expect(await numbers.settleWrite(db, layerId, range, 170)).toBe('overran');
  });

  test('a failed write gives its range back, unless a publish numbered anew', async () => {
    const range = await numbers.reserveForWrite(layerId, BASE, 64);
    await numbers.releaseWrite(layerId, range);
    expect(await counter()).toBe(100);

    const before = await numbers.reserveForWrite(layerId, BASE, 64);
    await numbers.touchSession(db, session('s1'));
    await numbers.issue(db, session('s1'), 8);
    await db
      .updateTable('layers')
      .set({ base_sha: 'b'.repeat(64) })
      .execute();
    await numbers.releaseWrite(layerId, before);
    expect(
      await db
        .selectFrom('object_number_blocks')
        .select('first')
        .where('session_id', 'is', null)
        .execute(),
    ).toEqual([]);
  });

  test('a write past the ceiling is refused', async () => {
    await db.updateTable('layers').set({ next_object_number: 8_388_600 }).execute();
    await expect(numbers.reserveForWrite(layerId, BASE, 64)).rejects.toMatchObject({
      code: EngineErrorCode.LayerFull,
    });
    expect(await counter()).toBe(8_388_600);
  });
});

describe('a publish', () => {
  test('drops every block and moves the counter past the new version', async () => {
    await numbers.touchSession(db, session('s1'));
    await numbers.issue(db, session('s1'), 8);
    await numbers.publish(db, layerId, 400);
    expect(await numbers.held(db, session('s1'))).toEqual([]);
    expect(await counter()).toBe(401);
    await numbers.publish(db, layerId, 10);
    expect(await counter()).toBe(401);
  });
});
