import type { JobId } from './protocol';

let _nextJobId = 1;

/**
 * Single process-wide job-id allocator shared by every producer that talks
 * over a {@link Transport} — the WorkerQueue AND the boot pipeline's raw
 * font-registration requests. One counter guarantees a boot-time jobId can
 * never collide with a queued job's id on the same transport.
 */
export function nextJobId(): JobId {
  return _nextJobId++;
}
