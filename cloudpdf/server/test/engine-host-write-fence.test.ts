import { describe, expect, test, afterEach } from 'vitest';
import {
  buildHostFixture,
  createAnnotation,
  listAnnotations,
  seedDocument,
  sleep,
  tearDownHostFixture,
  until,
  type HostFixture,
} from './_helpers/host-app-fixture';

/**
 * Kill-at-every-boundary (plan §7.3): the WS1 fence under engine-host
 * death, asserted at the OBSERVABLE level — no interleaving may ever
 * let a session be blessed at a version it does not embody, readers
 * must park behind the surviving write marker, and durable truth is
 * exactly what the next reader sees.
 *
 *   S1 — host killed DURING the engine apply: the write fails cleanly,
 *        nothing becomes durable, a retry succeeds.
 *   S2 — host killed AFTER apply, during the artifact upload: the
 *        API-side commit is unaffected and lands; a concurrent reader
 *        stays parked behind the write marker for the whole window and
 *        then sees the COMMITTED annotation (never the pre-commit
 *        artifact blessed as fresh).
 *   S3 — /readyz's engine clause: persistent host unavailability fails
 *        readiness (threshold 0 here); recovery restores it.
 */

describe('engine-host write fence (kill at every boundary)', () => {
  let fx: HostFixture;

  afterEach(async () => {
    await tearDownHostFixture(fx);
  });

  test('S1: host killed during the engine apply — clean failure, no durable change, retry works', async () => {
    fx = await buildHostFixture();
    await seedDocument(fx, 'tenant-s1', 'docfence001');

    // '__STALL__' parks the stub's annotations.create forever: the write
    // is deterministically mid-APPLY when we kill.
    const stalled = createAnnotation(fx, 'tenant-s1', 'docfence001', 'alice', '__STALL__');
    await until(() => fx.client.stats().inFlight >= 1);
    await sleep(150); // let the pre-create opens complete; the stall remains

    const genBefore = fx.client.generation();
    process.kill(fx.client.hostPid()!, 'SIGKILL');

    const res = await stalled;
    expect(res.status).toBeGreaterThanOrEqual(500); // clean failure, not a hang

    await until(() => fx.client.generation() > genBefore && fx.client.health().state === 'ready');

    // Durable truth unchanged; the retry path is healthy.
    const empty = await listAnnotations(fx, 'tenant-s1', 'docfence001', 'alice');
    expect(empty.status).toBe(200);
    expect(empty.body).not.toContain('__STALL__');

    const retry = await createAnnotation(fx, 'tenant-s1', 'docfence001', 'alice', 'after-crash');
    expect(retry.status).toBe(200);
    const list = await listAnnotations(fx, 'tenant-s1', 'docfence001', 'alice');
    expect(list.body).toContain('after-crash');
  }, 60_000);

  test('S2: host killed during the artifact upload — commit lands, parked reader sees committed truth', async () => {
    fx = await buildHostFixture();
    await seedDocument(fx, 'tenant-s2', 'docfence002');

    // Arm the upload gate: the layer-artifact put blocks until released.
    let release!: () => void;
    let waiting!: () => void;
    const waitingP = new Promise<void>((r) => (waiting = r));
    fx.gate.match = /\.layer$/;
    fx.gate.gate = new Promise<void>((r) => (release = r));
    fx.gate.onWaiting = waiting;

    const write = createAnnotation(fx, 'tenant-s2', 'docfence002', 'alice', 'k2');
    await waitingP; // engine apply DONE, upload blocked — the mid-commit window

    const genBefore = fx.client.generation();
    process.kill(fx.client.hostPid()!, 'SIGKILL');
    await until(() => fx.client.generation() > genBefore && fx.client.health().state === 'ready');

    // A reader during the window must PARK behind the write marker —
    // it may not slip through and recreate a session the late commit
    // could bless (the fence attack).
    let readerSettled = false;
    const reader = listAnnotations(fx, 'tenant-s2', 'docfence002', 'alice').then((r) => {
      readerSettled = true;
      return r;
    });
    await sleep(200);
    expect(readerSettled).toBe(false);

    // Release the upload: the API-side pipeline (unaffected by the host
    // death) finishes — CAS wins, commit lands.
    fx.gate.gate = null;
    release();
    const written = await write;
    expect(written.status).toBe(200);

    // The parked reader now resolves and sees the COMMITTED annotation:
    // its session reloaded from the committed artifact on the NEW host —
    // never a pre-commit session blessed as current.
    const read = await reader;
    expect(read.status).toBe(200);
    expect(read.body).toContain('k2');

    // The fence map is healthy: the next write builds on the commit.
    const next = await createAnnotation(fx, 'tenant-s2', 'docfence002', 'alice', 'k2b');
    expect(next.status).toBe(200);
    const finalList = await listAnnotations(fx, 'tenant-s2', 'docfence002', 'alice');
    expect(finalList.body).toContain('k2');
    expect(finalList.body).toContain('k2b');
  }, 60_000);

  test('S3: /readyz fails on persistent engine unavailability and recovers', async () => {
    fx = await buildHostFixture({ engineUnreadyAfterMs: 0 });

    const before = await fetch(`${fx.baseUrl}/readyz`);
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as { engine: { state: string } };
    expect(beforeBody.engine.state).toBe('ready');

    process.kill(fx.client.hostPid()!, 'SIGKILL');

    // Threshold 0: while the host is down, readiness fails with the
    // engine reason. (Respawn takes a few hundred ms — poll for it.)
    let saw503 = false;
    for (let i = 0; i < 50 && !saw503; i++) {
      const res = await fetch(`${fx.baseUrl}/readyz`);
      if (res.status === 503) {
        const body = (await res.json()) as { reasons?: string[]; engine: { state: string } };
        expect(body.reasons).toContain('engine');
        expect(body.engine.state).not.toBe('ready');
        saw503 = true;
      } else {
        await sleep(10);
      }
    }
    expect(saw503).toBe(true);

    // Recovery: the respawned host restores readiness.
    await until(() => fx.client.health().state === 'ready');
    const after = await fetch(`${fx.baseUrl}/readyz`);
    expect(after.status).toBe(200);
  }, 60_000);
});
