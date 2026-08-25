import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import { wirePack, type WorkerRequest } from '@embedpdf/engine-core/runtime';
import { EngineHostClient, type HostCrashEvent } from '../src/runtime/EngineHostClient';
import { hostEnvWhitelist } from '../src/runtime/host-protocol';

/**
 * The real thing: the actual engine-host-entry forked (via tsx) hosting
 * the actual WorkerThreadPool with the crashing stub worker. The
 * `{kind:'die'}` job kills a worker thread INSIDE the host → the pool's
 * fail-fast exits the host (70) → the client rejects in-flight, journals
 * the suspects, respawns, and the next call works. One test file, the
 * whole supervision story.
 */

const HOST_ENTRY = fileURLToPath(new URL('../src/runtime/engine-host-entry.ts', import.meta.url));
const STUB_WORKER = fileURLToPath(new URL('./_helpers/stub-worker-entry.cjs', import.meta.url));
const CRASHING_WORKER = fileURLToPath(
  new URL('./_helpers/crashing-worker-entry.cjs', import.meta.url),
);

const openBuild = (docId: string) => (jobId: number) => {
  const empty = new ArrayBuffer(0);
  return wirePack(
    { kind: 'open.fatMem', jobId, docId, bytes: empty, password: null } as unknown as WorkerRequest,
    [empty],
  );
};
const rawBuild = (payload: Record<string, unknown>) => (jobId: number) =>
  wirePack({ ...payload, jobId } as unknown as WorkerRequest);

let client: EngineHostClient | null = null;
afterAll(async () => {
  await client?.destroy();
});

async function until(fn: () => boolean, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > deadline) throw new Error('until: condition not met in time');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('engine host integration (real fork)', () => {
  test('dispatch → worker death inside the host → exit 70 → respawn → next call works', async () => {
    const crashes: HostCrashEvent[] = [];
    const restarts: number[] = [];
    client = await EngineHostClient.create({
      hostEntry: HOST_ENTRY,
      boot: { workerEntry: CRASHING_WORKER, poolSize: 1, fonts: [] },
      execArgv: ['--import', 'tsx'],
      respawnBaseMs: 50,
      readyTimeoutMs: 30_000,
      dispatchDeadlineMs: 30_000,
      shutdownTimeoutMs: 500,
      onHostCrash: (evt) => crashes.push(evt),
      onHostRestart: () => restarts.push(Date.now()),
    });

    const pidBefore = client.hostPid();
    expect(pidBefore).toBeGreaterThan(0);
    expect(client.generation()).toBe(1);

    // A working dispatch through the REAL host + pool + worker thread.
    await expect(client.runAdHoc('sha-ok', rawBuild({ kind: 'anything' }))).resolves.toBeNull();

    // Kill a worker thread inside the host. The pool's fail-fast exits
    // the whole host with 70; this in-flight call rejects.
    await expect(client.runAdHoc('sha-poison', rawBuild({ kind: 'die', code: 7 }))).rejects.toThrow(
      /host died|unavailable/i,
    );

    expect(crashes).toHaveLength(1);
    expect(crashes[0]!.code).toBe(70); // the fail-fast composition, observed
    // The engine identity is version:target from the runtime's build-id
    // subpath — never a placeholder.
    expect(crashes[0]!.engineBuild).toMatch(/^\d+\.\d+\.\d+.*:(darwin|linux|win32|wasm32)/);
    expect(crashes[0]!.suspects).toEqual([
      expect.objectContaining({ baseSha: 'sha-poison', opKind: 'die' }),
    ]);
    expect(restarts).toHaveLength(1);

    // The respawned host serves the next call; new generation, new pid.
    await expect(client.runAdHoc('sha-ok', rawBuild({ kind: 'anything' }))).resolves.toBeNull();
    expect(client.generation()).toBe(2);
    expect(client.hostPid()).not.toBe(pidBefore);

    await client.destroy();
    client = null;
  }, 60_000);

  test('open/close round-trip against the stub WorkerHost surface', async () => {
    client = await EngineHostClient.create({
      hostEntry: HOST_ENTRY,
      boot: { workerEntry: STUB_WORKER, poolSize: 1, fonts: [], memoryHeartbeatMs: 100 },
      execArgv: ['--import', 'tsx'],
      readyTimeoutMs: 30_000,
      dispatchDeadlineMs: 30_000,
      shutdownTimeoutMs: 2_000,
    });

    const opened = await client.runOpen('doc-int-1', 'a'.repeat(64), openBuild('doc-int-1'));
    expect(opened).toBeTruthy();
    // Residency mirrors + inspect refresh flow through the real protocol.
    const closed = await client.close('doc-int-1');
    expect(closed).toBeTruthy();

    // Graceful destroy: the REAL host answers the shutdown control.
    // protocol v3: the real fork emits memory heartbeats.
    await until(() => client.memory() !== null, 5_000);
    expect(client.memory()!.rssBytes).toBeGreaterThan(1_000_000);
    await client.destroy();
    client = null;
  }, 60_000);

  test('the child environment is whitelisted — no secrets cross the trust boundary', () => {
    const before = { ...process.env };
    try {
      process.env['CLOUDPDF_DB_URL'] = 'postgres://user:secret@db/x';
      process.env['CLOUDPDF_JWT_SECRET'] = 'super-secret';
      process.env['CLOUDPDF_LICENSE_KEY'] = 'key/abc';
      process.env['AWS_SECRET_ACCESS_KEY'] = 'aws-secret';
      process.env['NODE_OPTIONS'] = '--inspect=0.0.0.0:9229';
      const env = hostEnvWhitelist({ workerEntry: 'w.js', fonts: [] });
      expect(env['CLOUDPDF_DB_URL']).toBeUndefined();
      expect(env['CLOUDPDF_JWT_SECRET']).toBeUndefined();
      expect(env['CLOUDPDF_LICENSE_KEY']).toBeUndefined();
      expect(env['AWS_SECRET_ACCESS_KEY']).toBeUndefined();
      expect(env['NODE_OPTIONS']).toBeUndefined(); // never inherited
      expect(env['PATH']).toBeDefined();
      expect(JSON.parse(env['CLOUDPDF_ENGINE_HOST_CONFIG']!)).toEqual({
        workerEntry: 'w.js',
        fonts: [],
      });
    } finally {
      process.env = before;
    }
  });
});
