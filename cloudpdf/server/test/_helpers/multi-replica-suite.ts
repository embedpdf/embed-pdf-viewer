import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  createAnnotation,
  createAnnotationWithRetry,
  deleteAnnotation,
  docToken,
  failNextUpload,
  holdNextAuditAppend,
  holdNextUpload,
  listAnnotations,
  listLayerArtifactObjects,
  makeReplicaCluster,
  readCurrentArtifact,
  updateAnnotation,
  type AnnotationListBody,
  type ReplicaCluster,
  type ReplicaDbFactory,
} from './two-replica-harness';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * WS1 multi-replica correctness suite (SCALE-OUT.md §1.4/§1.6), engine-
 * parameterized: N replicas share durable truth (one database + one object
 * store) while each holds its own worker materialization. Every test is a
 * statement of the invariant: durable truth must contain exactly the
 * committed writes — no losses, no ghosts, no uncommitted bytes under a
 * version pin — under any interleaving of replicas.
 */
export function runMultiReplicaSuite(factory: ReplicaDbFactory): void {
  describe(`multi-replica layer writes [${factory.label}]`, () => {
    const TENANT = 'tenant-replicas';
    const DOC = 'docreplicas001';
    const LAYER = 'alice';

    let cluster: ReplicaCluster;

    beforeEach(async () => {
      cluster = await makeReplicaCluster(2, factory);
      await cluster.seedDocument(TENANT, DOC, { pageCount: 2 });
    });

    afterEach(async () => {
      await cluster.teardown();
    });

    test('concurrent annotation creates from two replicas keep both annotations', async () => {
      const [a, b] = cluster.replicas;

      // 1. B materializes the layer FIRST (a read is enough): its worker
      //    session now embodies the fresh/empty layer state.
      const primed = await listAnnotations(b!, { tenantId: TENANT, docId: DOC, layerName: LAYER });
      expect(primed.annotations).toHaveLength(0);

      // 2. A commits X — durable truth advances to v1 = [X].
      const createdX = await createAnnotation(a!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        contents: 'X',
      });
      expect(createdX.status).toBe(200);
      const afterA = await readCurrentArtifact(cluster, DOC, LAYER);
      expect(afterA.annots.map((an) => an.contents)).toEqual(['X']);

      // 3. B commits Y through its (stale) materialization.
      const createdY = await createAnnotation(b!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        contents: 'Y',
      });
      expect(createdY.status).toBe(200);

      // Durable truth must contain BOTH writes. Without the layer-session
      // fence, B's artifact is [Y] — X is silently gone while the version
      // counter looks healthy.
      const final = await readCurrentArtifact(cluster, DOC, LAYER);
      expect(final.annots.map((an) => an.contents).sort()).toEqual(['X', 'Y']);

      // And a fresh replica (worker state built from durable truth alone)
      // must see both annotations through the public API.
      const c = await cluster.addReplica('c');
      const list = await listAnnotations(c, { tenantId: TENANT, docId: DOC, layerName: LAYER });
      expect(list.annotations).toHaveLength(2);
      expect(list.annotations.map((an) => an.contents).sort()).toEqual(['X', 'Y']);
    });

    test('a stale replica refreshes its worker session on read', async () => {
      const [a, b] = cluster.replicas;

      // B materializes the (empty) layer, then A advances durable truth.
      const primed = await listAnnotations(b!, { tenantId: TENANT, docId: DOC, layerName: LAYER });
      expect(primed.annotations).toHaveLength(0);
      const created = await createAnnotation(a!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        contents: 'X',
      });
      expect(created.status).toBe(200);

      // B's next read must NOT serve its stale materialization: the
      // request-time freshness check (ensureLayerOnPool → layer row version)
      // reloads the session from A's artifact. Without it, B silently
      // returns [] under a current manifest — the read-side mirror of the
      // lost-update bug.
      const viaB = await listAnnotations(b!, { tenantId: TENANT, docId: DOC, layerName: LAYER });
      expect(viaB.annotations.map((an) => an.contents)).toEqual(['X']);
    });

    test('soak: interleaved writes from both replicas lose nothing', async () => {
      const [a, b] = cluster.replicas;
      const PER_REPLICA = 20;

      // Fire everything concurrently through BOTH replicas. Each replica
      // serializes its own writes (per-process layer queue); the fence +
      // rebase serialize across them. A client retry on 409 mirrors the
      // real contract when the server's one-rebase budget is exhausted.
      const jobs: Array<Promise<{ status: number; attempts: number; body: unknown }>> = [];
      for (let i = 0; i < PER_REPLICA; i++) {
        jobs.push(
          createAnnotationWithRetry(a!, {
            tenantId: TENANT,
            docId: DOC,
            layerName: LAYER,
            contents: `a-${i}`,
          }),
          createAnnotationWithRetry(b!, {
            tenantId: TENANT,
            docId: DOC,
            layerName: LAYER,
            contents: `b-${i}`,
          }),
        );
      }
      const results = await Promise.all(jobs);
      for (const r of results) {
        if (r.status !== 200) console.error('SOAK-FAIL', JSON.stringify(r));
        expect(r.status).toBe(200);
      }

      const total = PER_REPLICA * 2;

      // Durable truth, probed three independent ways — the invariant from
      // SCALE-OUT.md §1.5: the artifact at current_version N contains every
      // committed mutation ≤ N.
      const final = await readCurrentArtifact(cluster, DOC, LAYER);
      expect(final.annots).toHaveLength(total);
      expect(final.version).toBe(total); // failed CAS attempts burn no versions

      const auditRows = await cluster.replicas[0]!.db.selectFrom('audit_log')
        .select(['kind'])
        .where('doc_id', '=', DOC)
        .execute();
      expect(auditRows.filter((row) => row.kind === 'annot.create')).toHaveLength(total);

      const c = await cluster.addReplica('soak-verify');
      const list = await listAnnotations(c, { tenantId: TENANT, docId: DOC, layerName: LAYER });
      const contents = list.annotations.map((an) => an.contents).sort();
      const expected = results
        .map((_, i) => (i % 2 === 0 ? `a-${Math.floor(i / 2)}` : `b-${Math.floor(i / 2)}`))
        .sort();
      expect(contents).toEqual(expected);
    }, 120_000);

    test('mid-flight fence: a remote commit inside the prepare→commit window rebases cleanly', async () => {
      const [a, b] = cluster.replicas;

      // Deterministic window injection: wrap B's LayerService prepare seam so
      // that AFTER it reads the layer row (the version its commit CAS will
      // compare against) but BEFORE the worker applies, replica A commits.
      // This is exactly the race the fence exists for, made reproducible.
      const svc = b!.bundle.layerService as unknown as {
        materializeLayerForWrite: (...args: unknown[]) => Promise<unknown>;
      };
      const original = svc.materializeLayerForWrite.bind(svc);
      let armed = true;
      svc.materializeLayerForWrite = async (...args: unknown[]) => {
        const materialized = await original(...args);
        if (armed) {
          armed = false; // the rebase re-run must NOT re-trigger the remote write
          const remote = await createAnnotation(a!, {
            tenantId: TENANT,
            docId: DOC,
            layerName: LAYER,
            contents: 'REMOTE',
          });
          expect(remote.status).toBe(200);
        }
        return materialized;
      };

      const local = await createAnnotation(b!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        contents: 'LOCAL',
      });
      // One fence loss is absorbed by the server-side rebase: the caller
      // sees plain success, never a conflict.
      expect(local.status).toBe(200);
      expect(armed).toBe(false);

      const final = await readCurrentArtifact(cluster, DOC, LAYER);
      expect(final.annots.map((an) => an.contents).sort()).toEqual(['LOCAL', 'REMOTE']);
      expect(final.version).toBe(2);

      // No orphaned attempts: B's fence-losing upload must be cleaned up
      // when its commit loses — exactly the two committed artifacts remain.
      const objects = await listLayerArtifactObjects(cluster, TENANT, DOC, LAYER);
      expect(objects).toHaveLength(2);
    });

    test('rebase surfaces delete-vs-update as clean NotFound, layer intact', async () => {
      const [a, b] = cluster.replicas;

      // A creates Z; B materializes a session that still contains Z.
      const created = await createAnnotation(a!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        contents: 'Z',
      });
      expect(created.status).toBe(200);
      const createdBody = created.body as {
        created: { ref: { kind: string; annotObjectNumber: number } };
      };
      expect(createdBody.created.ref.kind).toBe('objectNumber');
      const objectNumber = createdBody.created.ref.annotObjectNumber;

      const primed = await listAnnotations(b!, { tenantId: TENANT, docId: DOC, layerName: LAYER });
      expect(primed.annotations).toHaveLength(1);

      // A deletes Z; B — stale — tries to update it. The correct semantic
      // answer is NotFound (the annotation is gone), never a merge artifact
      // and never a resurrected Z.
      const deleted = await deleteAnnotation(a!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        objectNumber,
      });
      expect(deleted.status).toBe(200);

      const conflicted = await updateAnnotation(b!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        objectNumber,
        contents: 'zz',
      });
      if (conflicted.status !== 404) console.error('UPD-FAIL', JSON.stringify(conflicted));
      expect(conflicted.status).toBe(404);

      const final = await readCurrentArtifact(cluster, DOC, LAYER);
      expect(final.annots).toHaveLength(0);
    });

    /**
     * P1 (review): the commit-time version check must be ATOMIC with the
     * update. Both replicas are held INSIDE their commit transactions —
     * after each has read + checked the layer at version 0, before either
     * has updated (the audit append sits exactly between the two). On
     * release the transactions overlap in the read→update window: with an
     * unconditional `UPDATE … WHERE id`, Postgres re-evaluates only the id
     * predicate after the row lock clears, so BOTH updates apply and one
     * artifact silently vanishes. A guarded UPDATE (`AND current_version`)
     * turns the loser into a LayerFenceConflict → rebase → both survive.
     *
     * SQLite cannot represent the overlap (database-level single writer;
     * a held write transaction blocks the second connection outright), so
     * the test is Postgres-only by construction, not by convenience.
     */
    test.skipIf(!factory.supportsCommitOverlap)(
      'overlapping commit transactions: both read version 0, only one may win it',
      async () => {
        const [a, b] = cluster.replicas;

        const holdA = holdNextAuditAppend(a!);
        const holdB = holdNextAuditAppend(b!);
        const writeA = createAnnotation(a!, {
          tenantId: TENANT,
          docId: DOC,
          layerName: LAYER,
          contents: 'A1',
        });
        const writeB = createAnnotation(b!, {
          tenantId: TENANT,
          docId: DOC,
          layerName: LAYER,
          contents: 'B1',
        });

        // Wait until BOTH transactions have passed their version read at 0.
        // Timeboxed: if a write dies before reaching its audit append, fail
        // loudly instead of hanging; the finally always opens the gates so
        // a failed barrier can't wedge teardown (the held transaction keeps
        // a Fastify request in flight).
        try {
          await Promise.all(
            [holdA.held, holdB.held].map((held, i) =>
              Promise.race([
                held,
                sleep(15_000).then(() =>
                  Promise.reject(
                    new Error(`replica ${i === 0 ? 'a' : 'b'} never reached its audit append`),
                  ),
                ),
              ]),
            ),
          );
        } finally {
          holdA.release();
          holdB.release();
        }

        const [resA, resB] = await Promise.all([writeA, writeB]);
        expect(resA.status).toBe(200);
        expect(resB.status).toBe(200);

        const final = await readCurrentArtifact(cluster, DOC, LAYER);
        expect(final.annots.map((an) => an.contents).sort()).toEqual(['A1', 'B1']);
        expect(final.version).toBe(2);

        const auditRows = await cluster.replicas[0]!.db.selectFrom('audit_log')
          .select(['kind'])
          .where('doc_id', '=', DOC)
          .execute();
        expect(auditRows.filter((row) => row.kind === 'annot.create')).toHaveLength(2);

        // The loser's pre-commit upload must not leak: exactly the two
        // committed artifacts remain.
        const objects = await listLayerArtifactObjects(cluster, TENANT, DOC, LAYER);
        expect(objects).toHaveLength(2);
      },
      90_000,
    );

    /**
     * P1 (review): a failed write must never become durable. The worker
     * applies the mutation BEFORE upload+commit; if persistence fails, the
     * session is dirty while the fence map still reports it clean — and the
     * next successful write would carry the ghost into its artifact.
     */
    test('a failed write never becomes durable (no ghost writes)', async () => {
      const [a, b] = cluster.replicas;

      // A committed baseline, so the ghost has an artifact chain to haunt.
      const base = await createAnnotation(a!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        contents: 'BASE',
      });
      expect(base.status).toBe(200);

      // B's write applies in the worker, then its upload fails.
      failNextUpload(b!);
      const ghost = await createAnnotation(b!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        contents: 'GHOST',
      });
      expect(ghost.status).not.toBe(200);

      // B's next write succeeds — and must NOT resurrect the failed one.
      const real = await createAnnotation(b!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        contents: 'REAL',
      });
      expect(real.status).toBe(200);

      const final = await readCurrentArtifact(cluster, DOC, LAYER);
      expect(final.annots.map((an) => an.contents).sort()).toEqual(['BASE', 'REAL']);
      expect(final.version).toBe(2);

      const c = await cluster.addReplica('ghost-verify');
      const list = await listAnnotations(c, { tenantId: TENANT, docId: DOC, layerName: LAYER });
      expect(list.annotations.map((an) => an.contents).sort()).toEqual(['BASE', 'REAL']);
    });

    /**
     * P1 (review): a version-PINNED read must never serve uncommitted
     * content — the response carries `Cache-Control: immutable`, so one
     * dirty read poisons every future reader of that pin via the CDN.
     * The write is held post-apply/pre-commit; a read at the still-current
     * pin issued in that window must see only committed state (or refuse
     * with 404 once the pin is no longer current after waiting).
     */
    test('a version-pinned read never serves uncommitted content', async () => {
      const [, b] = cluster.replicas;

      const base = await createAnnotation(b!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        contents: 'BASE',
      });
      expect(base.status).toBe(200);
      const baseBody = base.body as {
        meta: { cacheDelta: { pages: Array<{ cache: { annotationVersion: number } }> } };
      };
      const pin = baseBody.meta.cacheDelta.pages[0]!.cache.annotationVersion;

      // Trap B's next write inside the dirty window (applied, not committed).
      const { held, release } = holdNextUpload(b!);
      const dirtyWrite = createAnnotation(b!, {
        tenantId: TENANT,
        docId: DOC,
        layerName: LAYER,
        contents: 'DIRTY',
      });
      await held;

      // Pinned read at the CURRENT (pre-commit) version, issued mid-window.
      const readPromise = fetch(
        `${b!.baseUrl}/v1/docs/${DOC}/layers/${LAYER}/annotations/pages/1/items@annotationVersion=${pin}`,
        { headers: { Authorization: `Bearer ${docToken(TENANT, DOC, LAYER)}` } },
      );
      // Give the read time to either answer (unfixed: serves the dirty
      // session) or park behind the in-flight write (fixed).
      await sleep(200);
      release();

      const res = await readPromise;
      const body = (await res.json()) as AnnotationListBody;
      const write = await dirtyWrite;
      expect(write.status).toBe(200);

      if (res.status === 200) {
        // If the pin was served, it must contain EXACTLY the committed
        // state of that version — never the uncommitted DIRTY annotation.
        expect(body.annotations.map((an) => an.contents)).toEqual(['BASE']);
      } else {
        // Equally correct: after waiting out the write, the pin is no
        // longer current — refuse, and the client refetches the manifest.
        expect(res.status).toBe(404);
      }
    });
  });
}
