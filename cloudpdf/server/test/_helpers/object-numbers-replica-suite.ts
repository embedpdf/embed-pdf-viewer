import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { objectNumbersIn, parseObjectNumberRanges } from '@embedpdf/engine-core/runtime';
import {
  docToken,
  highlightDraft,
  holdNextUpload,
  listAnnotations,
  makeReplicaCluster,
  type Replica,
  type ReplicaCluster,
  type ReplicaDbFactory,
} from './two-replica-harness';

/**
 * Object numbers handed to editing sessions, across replicas that share
 * one database and one object store, engine-parameterized like the
 * multi-replica suite. Every test states one invariant: a number goes to
 * one owner, a session's or a write's, under any interleaving.
 */
export function runObjectNumberReplicaSuite(factory: ReplicaDbFactory): void {
  describe(`object numbers across replicas [${factory.label}]`, () => {
    const TENANT = 'tenant-numbers';
    const DOC = 'docnumbers001';
    const LAYER = 'editing';

    let cluster: ReplicaCluster;

    beforeEach(async () => {
      cluster = await makeReplicaCluster(2, factory);
      await cluster.seedDocument(TENANT, DOC, { pageCount: 2 });
    });

    afterEach(async () => {
      await cluster.teardown();
    });

    interface Answer {
      status: number;
      headers: Headers;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- probed loosely
      body: any;
    }

    const request = async (
      replica: Replica,
      method: string,
      path: string,
      opts: { session?: string; sub?: string; body?: unknown; headers?: Record<string, string> },
    ): Promise<Answer> => {
      const res = await fetch(`${replica.baseUrl}/v1/docs/${DOC}/layers/${LAYER}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${docToken(TENANT, DOC, LAYER, opts.sub)}`,
          ...(opts.session ? { 'X-Engine-Session-Id': opts.session } : {}),
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...opts.headers,
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
      return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
    };

    const handOut = async (
      replica: Replica,
      session: string,
      wanted: number,
      sub = 'user-1',
    ): Promise<number[]> => {
      const answer = await request(replica, 'POST', '/access', {
        session,
        sub,
        body: { objectNumbers: wanted },
      });
      expect(answer.status).toBe(200);
      return objectNumbersIn(answer.body.edit.objectNumbers);
    };

    const create = (
      replica: Replica,
      objectNumber: number | null,
      opts: { session?: string; sub?: string; headers?: Record<string, string> } = {},
    ) =>
      request(
        replica,
        'POST',
        `/annotations/pages/obj:1/items${objectNumber !== null ? `?objectNumber=${objectNumber}` : ''}`,
        { ...opts, body: highlightDraft(`at ${objectNumber}`) },
      );

    /** Create, retrying the conflicts a busy layer answers (the op was not applied). */
    const createRetrying = async (replica: Replica): Promise<Answer> => {
      for (let attempt = 1; ; attempt++) {
        const answer = await create(replica, null);
        if (answer.status !== 409 || attempt > 8) return answer;
        await new Promise((resolve) => setTimeout(resolve, 5 * attempt));
      }
    };

    /** The last object number of every version the layer committed. */
    const committedLastNumbers = async (): Promise<number[]> => {
      const db = cluster.replicas[0]!.db;
      const rows = await db
        .selectFrom('audit_log')
        .select('artifact_key')
        .where('doc_id', '=', DOC)
        .where('layer_name', '=', LAYER)
        .execute();
      const last: number[] = [];
      for (const row of rows) {
        const bytes = await cluster.storage.get(row.artifact_key);
        if (!bytes) continue;
        const parsed = JSON.parse(Buffer.from(bytes).subarray(2).toString('utf8')) as {
          last?: number;
        };
        if (parsed.last !== undefined) last.push(parsed.last);
      }
      return last;
    };

    test('two replicas handing numbers out at once never hand one out twice', async () => {
      const [a, b] = cluster.replicas;
      const answers = await Promise.all(
        Array.from({ length: 12 }, (_, i) => {
          const replica = i % 2 === 0 ? a! : b!;
          const session = `cloud:s${i}`;
          const sub = `user-${i}`;
          return i % 3 === 0
            ? request(replica, 'POST', '/object-numbers', { session, sub, body: { count: 40 } })
            : request(replica, 'POST', '/access', {
                session,
                sub,
                body: { objectNumbers: 32 },
              });
        }),
      );
      const numbers = answers.flatMap((answer) => {
        expect(answer.status).toBe(200);
        return objectNumbersIn(answer.body.edit?.objectNumbers ?? answer.body.objectNumbers);
      });
      expect(numbers.length).toBeGreaterThanOrEqual(4 * 40 + 8 * 32);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    test('writes and handouts interleave without sharing a number', async () => {
      const [a, b] = cluster.replicas;
      const writes = Array.from({ length: 8 }, (_, i) => createRetrying(i % 2 === 0 ? a! : b!));
      const handouts = Array.from({ length: 8 }, (_, i) =>
        handOut(i % 2 === 0 ? b! : a!, `cloud:h${i}`, 8, `user-h${i}`),
      );
      const [written, handed] = await Promise.all([Promise.all(writes), Promise.all(handouts)]);
      for (const answer of written) expect(answer.status).toBe(200);

      const issued = handed.flat();
      expect(new Set(issued).size).toBe(issued.length);
      // Each committed version made one object of its own, numbered from its
      // write's range: never a number a session holds.
      const own = await committedLastNumbers();
      expect(own).toHaveLength(8);
      expect(own.filter((number) => issued.includes(number))).toEqual([]);
      const counter = await cluster.replicas[0]!.db.selectFrom('layers')
        .select('next_object_number')
        .where('doc_id', '=', DOC)
        .where('name', '=', LAYER)
        .executeTakeFirstOrThrow();
      expect(Number(counter.next_object_number)).toBeGreaterThan(Math.max(...issued, ...own));
    });

    test('a write that overruns its range while numbers go out runs again; its first range comes back', async () => {
      const [a, b] = cluster.replicas;
      await handOut(a!, 'cloud:first', 8);
      const conflicts = () =>
        (b!.bundle.layerService as unknown as { counters: { layerWriteConflicts: number } })
          .counters.layerWriteConflicts;
      const conflictsBefore = conflicts();
      const hold = holdNextUpload(b!);
      const writing = request(b!, 'POST', '/annotations/pages/obj:1/items', {
        body: highlightDraft('__MANY_OBJECTS__'),
      });
      await hold.held;
      // Numbers go out while the write, which made more objects than its
      // range holds, is still to commit.
      const meanwhile = await handOut(a!, 'cloud:meanwhile', 8, 'user-2');
      hold.release();
      expect((await writing).status).toBe(200);
      expect(conflicts()).toBe(conflictsBefore + 1);

      const [last] = (await committedLastNumbers()).sort((x, y) => y - x);
      const own = Array.from({ length: 100 }, (_, i) => last! - i);
      expect(own.filter((number) => meanwhile.includes(number))).toEqual([]);
      // The first attempt's range lies before the numbers that went out
      // meanwhile; it came back, and goes out before the counter.
      const next = await handOut(a!, 'cloud:next', 8, 'user-3');
      expect(Math.max(...next)).toBeLessThan(Math.min(...meanwhile));
      expect(next.filter((number) => own.includes(number))).toEqual([]);
    });

    test('a write may name only numbers its own session holds, on any replica', async () => {
      const [a, b] = cluster.replicas;
      const [mine, also] = await handOut(a!, 'cloud:mine', 8);
      const [theirs] = await handOut(b!, 'cloud:theirs', 8, 'user-2');
      expect((await create(b!, mine!, { session: 'cloud:mine' })).status).toBe(200);

      const refusals = [
        // Spent by the create above.
        await create(a!, mine!, { session: 'cloud:mine' }),
        // Another session's.
        await create(a!, theirs!, { session: 'cloud:mine' }),
        await create(a!, also!, { session: 'cloud:theirs', sub: 'user-2' }),
        // The session's id, but another subject.
        await create(a!, also!, { session: 'cloud:mine', sub: 'user-2' }),
        // No session.
        await create(b!, also!),
      ];
      for (const [i, refused] of refusals.entries()) {
        expect(refused.status).toBe(409);
        expect(refused.body.error).toMatchObject({
          code: 'ObjectNumberUnavailable',
          details: { objectNumber: [mine, theirs, also, also, also][i], reason: 'not-held' },
        });
      }
      // Still the session's own.
      expect((await create(a!, also!, { session: 'cloud:mine' })).status).toBe(200);
    });

    test('the same Idempotency-Key on two replicas commits once', async () => {
      const [a, b] = cluster.replicas;
      const [number] = await handOut(a!, 'cloud:idem', 8);
      const opts = {
        session: 'cloud:idem',
        headers: { 'Idempotency-Key': 'paste-1', 'EmbedPDF-Reserve-Object-Numbers': '4' },
      };
      const [first, second] = await Promise.all([
        create(a!, number!, opts),
        create(b!, number!, opts),
      ]);
      expect([first.status, second.status]).toEqual([200, 200]);
      expect(second.body).toEqual(first.body);
      // Only the request that committed hands numbers out.
      const toppedUp = [first, second].filter(
        (answer) => parseObjectNumberRanges(answer.headers.get('embedpdf-object-numbers')).length,
      );
      expect(toppedUp).toHaveLength(1);

      const rows = await cluster.replicas[0]!.db.selectFrom('audit_log')
        .select('id')
        .where('idempotency_key', '=', 'paste-1')
        .execute();
      expect(rows).toHaveLength(1);
      const listed = await listAnnotations(a!, { tenantId: TENANT, docId: DOC, layerName: LAYER });
      expect(listed.annotations).toHaveLength(1);
    });

    test('a block that moves between the check and the commit refuses the write', async () => {
      const [a, b] = cluster.replicas;
      const [number] = await handOut(a!, 'cloud:moved', 8);
      const before = await listAnnotations(b!, { tenantId: TENANT, docId: DOC, layerName: LAYER });

      const hold = holdNextUpload(b!);
      const creating = create(b!, number!, { session: 'cloud:moved' });
      await hold.held;
      // Another session took the block meanwhile (its owner had expired).
      await cluster.replicas[0]!.db.updateTable('object_number_blocks')
        .set({ session_id: 'cloud:taker' })
        .where('session_id', '=', 'cloud:moved')
        .execute();
      hold.release();

      const refused = await creating;
      expect(refused.status).toBe(409);
      expect(refused.body.error).toMatchObject({
        code: 'ObjectNumberUnavailable',
        details: { objectNumber: number, reason: 'not-held' },
      });
      // Nothing of the refused write landed, on either replica.
      for (const replica of [a!, b!]) {
        const after = await listAnnotations(replica, {
          tenantId: TENANT,
          docId: DOC,
          layerName: LAYER,
        });
        expect(after.annotations).toHaveLength(before.annotations.length);
      }
    });
  });
}
