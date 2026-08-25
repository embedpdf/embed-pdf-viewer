import { describe, expect, test, vi } from 'vitest';
import {
  wirePack,
  type WirePack,
  type WorkerJobId,
  type WorkerRequest,
} from '@embedpdf/engine-core/runtime';
import { WorkerThreadPool } from '../src/runtime/WorkerThreadPool';

const CRASHING_ENTRY = new URL('./_helpers/crashing-worker-entry.cjs', import.meta.url);
const EXIT_ON_BOOT_ENTRY = new URL('./_helpers/exit-on-boot-worker-entry.cjs', import.meta.url);

/**
 * Fail-fast supervision. Pool slots are never respawned in-process, so
 * a dead worker without a fatal response leaves the process serving
 * errors for every doc bound to the corpse while health checks stay
 * green. These tests pin the contract: unexpected death after boot →
 * in-flight jobs reject + the fatal handler fires (default:
 * process.exit(70)); death during destroy() → silence; death during
 * boot → create() rejects instead of hanging.
 */

const build =
  (payload: Record<string, unknown>) =>
  (jobId: WorkerJobId): WirePack<WorkerRequest> =>
    wirePack({ ...payload, jobId } as unknown as WorkerRequest);

describe('WorkerThreadPool fail-fast', () => {
  test('unexpected worker exit rejects in-flight jobs and fires the fatal handler', async () => {
    const onFatalWorkerExit = vi.fn();
    const pool = await WorkerThreadPool.create({
      workerEntry: CRASHING_ENTRY,
      size: 1,
      onFatalWorkerExit,
    });
    try {
      const parked = pool.runAdHoc(undefined, build({ kind: 'park' }));
      const died = pool.runAdHoc(undefined, build({ kind: 'die', code: 7 }));

      await expect(parked).rejects.toThrow(/exited unexpectedly \(code 7\)/);
      await expect(died).rejects.toThrow(/exited unexpectedly \(code 7\)/);
      expect(onFatalWorkerExit).toHaveBeenCalledTimes(1);
      expect(onFatalWorkerExit).toHaveBeenCalledWith({ slot: 0, code: 7 });
    } finally {
      await pool.destroy();
    }
  });

  test('worker exits during destroy() are the plan, not a fatality', async () => {
    const onFatalWorkerExit = vi.fn();
    const pool = await WorkerThreadPool.create({
      workerEntry: CRASHING_ENTRY,
      size: 2,
      onFatalWorkerExit,
    });
    await pool.destroy(); // shutdown handshake -> stub exit(0) per worker
    expect(onFatalWorkerExit).not.toHaveBeenCalled();
  });

  test('a worker that dies before its ready handshake fails create() instead of hanging', async () => {
    const onFatalWorkerExit = vi.fn();
    await expect(
      WorkerThreadPool.create({
        workerEntry: EXIT_ON_BOOT_ENTRY,
        size: 1,
        onFatalWorkerExit,
      }),
    ).rejects.toThrow(/exited during initialization \(code 3\)/);
    // Boot failures surface as create() errors, never as fatal exits.
    expect(onFatalWorkerExit).not.toHaveBeenCalled();
  }, 10_000);
});
