import type {
  SerializedEngineError,
  WorkerRequest,
  WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';

import type { FallbackFontDescriptor } from './WorkerThreadPool';

/**
 * The parent↔engine-host IPC protocol. Version-checked at `ready`: a
 * mismatched host (stale dist beside a newer parent) is a deploy bug and
 * is refused, never negotiated.
 *
 * Correlation model: the CLIENT allocates `callId`s; `payload.jobId` is
 * only a correlation hint across the boundary — the pool inside the host
 * allocates its own jobIds (`dispatchToSlot`), so the host REWRITES the
 * payload's jobId before dispatch. Forwarding the client's id verbatim
 * would silently orphan every response.
 */
// v2 (WS3 Phase B): the engine wire surface the host serves grew the
// `*.renderEncoded` kinds. The version covers the END-TO-END contract a
// child must speak — envelope AND the engine ops riding inside it — so a
// custom `engineHostEntry` pointing at a pre-B dist fails the handshake
// loudly instead of rejecting every encoded render as an unknown kind.
// v3 (WS3 Phase C step 0): the host emits the `memory` heartbeat the
// C2 recycle policy and the memory gauges read.
export const HOST_PROTOCOL_VERSION = 3;

/** Parent → host. */
export type HostRequest =
  | {
      t: 'dispatch';
      callId: number;
      op: 'runOpen' | 'run' | 'runAdHoc';
      docId?: string;
      baseSha?: string;
      payload: WorkerRequest;
    }
  | { t: 'close'; callId: number; docId: string }
  | { t: 'abort'; callId: number }
  | { t: 'inspect'; callId: number }
  | { t: 'shutdown'; callId: number };

/** Typed control results (close/shutdown/inspect are not worker jobs). */
export type HostControlResult =
  | { tag: 'closed'; result: WorkerResultPayload | null }
  | { tag: 'shutdown' }
  | { tag: 'inspect'; slots: Array<{ slot: number; docIds: string[]; baseShas: string[] }> };

/** Host → parent. */
export type HostMessage =
  | { t: 'ready'; protocol: number; pid: number; engineBuild: string }
  | { t: 'init-error'; error: string }
  | { t: 'result'; callId: number; result: WorkerResultPayload }
  | { t: 'control'; callId: number; control: HostControlResult }
  | { t: 'error'; callId: number; error: SerializedEngineError }
  | { t: 'evict'; docId: string; baseSha: string; slot: number }
  | { t: 'memory'; rssBytes: number; heapUsedBytes: number };

/**
 * Host boot configuration, passed as ONE env var (JSON) — no argv
 * escaping games, and the whitelist (`hostEnvWhitelist`) stays the only
 * thing that decides what the child may see.
 */
export interface HostBootConfig {
  /** Worker-thread entry (file URL string or path) — the SAME worker-entry the inline pool uses. */
  workerEntry: string;
  poolSize?: number;
  maxDocsPerSlot?: number;
  fonts: ReadonlyArray<FallbackFontDescriptor>;
  /** Memory-heartbeat interval (ms). Default 5000; tests shrink it. */
  memoryHeartbeatMs?: number;
}

export const HOST_CONFIG_ENV = 'CLOUDPDF_ENGINE_HOST_CONFIG';

/**
 * The child is a LOWER trust domain — that is the entire point of host
 * mode. It must never see database credentials, the JWT secret, the
 * license key, or object-store credentials. Whitelist, never spread:
 * only process/runtime basics plus fontconfig cache locations cross.
 * `NODE_OPTIONS` is deliberately excluded (an inherited `--inspect`
 * would open a port in the engine process);
 * `CLOUDPDF_ENGINE_HOST_NODE_OPTIONS` is the explicit escape hatch.
 */
export function hostEnvWhitelist(boot: HostBootConfig): NodeJS.ProcessEnv {
  const keep = [
    'PATH',
    'HOME',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'XDG_CACHE_HOME',
    'FONTCONFIG_PATH',
    'FONTCONFIG_FILE',
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const key of keep) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  if (process.env['CLOUDPDF_ENGINE_HOST_NODE_OPTIONS'] !== undefined) {
    env['NODE_OPTIONS'] = process.env['CLOUDPDF_ENGINE_HOST_NODE_OPTIONS'];
  }
  env[HOST_CONFIG_ENV] = JSON.stringify(boot);
  return env;
}
