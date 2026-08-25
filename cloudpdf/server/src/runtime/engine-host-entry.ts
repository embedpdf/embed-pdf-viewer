/**
 * Engine-host child entry. Boots the UNCHANGED WorkerThreadPool with the
 * UNCHANGED worker-entry inside a separate process, so a native PDFium
 * crash costs this process — never the API.
 *
 * Supervision composition: the pool's default `onFatalWorkerExit`
 * (process.exit(70)) is exactly right here — a dead worker thread kills
 * THIS host, the parent observes the exit, journals the in-flight
 * suspects, and respawns. The same fail-fast that meant "pod restart"
 * in inline mode means "sub-second engine respawn" in host mode.
 */
import { AbortError, serializeError, wirePack } from '@embedpdf/engine-core/runtime';
import { engineRuntimeBuildId } from '@embedpdf/engine-runtime/build-id';

import {
  HOST_CONFIG_ENV,
  HOST_PROTOCOL_VERSION,
  type HostBootConfig,
  type HostMessage,
  type HostRequest,
} from './host-protocol';
import { WorkerThreadPool } from './WorkerThreadPool';

if (!process.send) {
  throw new Error('engine-host-entry must be forked with an IPC channel');
}
const send = (msg: HostMessage) => process.send!(msg);

const rawConfig = process.env[HOST_CONFIG_ENV];
if (!rawConfig) {
  send({ t: 'init-error', error: `${HOST_CONFIG_ENV} is not set` });
  process.exit(1);
}
const config: HostBootConfig = JSON.parse(rawConfig);

// Boot config crosses IPC as JSON, so a URL workerEntry arrives as a
// 'file://…' STRING — which `new Worker(string)` treats as a filesystem
// path and ENOENTs on. Rehydrate it into a URL instance.
const workerEntry = config.workerEntry.startsWith('file:')
  ? new URL(config.workerEntry)
  : config.workerEntry;

/** Per-call abort controllers; registered BEFORE the dispatch awaits. */
const aborts = new Map<number, AbortController>();

(async () => {
  const pool = await WorkerThreadPool.create({
    workerEntry,
    size: config.poolSize,
    maxDocsPerSlot: config.maxDocsPerSlot,
    fonts: config.fonts,
    onEvict: (evt) => send({ t: 'evict', ...evt }),
    // No onFatalWorkerExit override: the default process.exit(70) IS the
    // supervision contract with the parent.
  });

  process.on('message', (msg: HostRequest) => void handle(msg));

  async function handle(msg: HostRequest): Promise<void> {
    switch (msg.t) {
      case 'dispatch': {
        const ac = new AbortController();
        aborts.set(msg.callId, ac);
        try {
          // Rewrite jobId: the pool allocates its own inside
          // dispatchToSlot; the parent's payload.jobId is only a hint.
          // jobId is a top-level field, so a shallow spread suffices and
          // copies no buffers.
          const build = (jobId: number) => wirePack({ ...msg.payload, jobId });
          const result =
            msg.op === 'run'
              ? await pool.run(msg.docId!, build, ac.signal)
              : msg.op === 'runOpen'
                ? msg.baseSha !== undefined
                  ? await pool.runOpen(msg.docId!, msg.baseSha, build, ac.signal)
                  : await pool.runOpen(msg.docId!, build, ac.signal)
                : await pool.runAdHoc(msg.baseSha, build, ac.signal);
          send({ t: 'result', callId: msg.callId, result });
        } catch (err) {
          send({ t: 'error', callId: msg.callId, error: serializeError(err) });
        } finally {
          aborts.delete(msg.callId);
        }
        return;
      }
      case 'close': {
        try {
          const result = await pool.close(msg.docId);
          send({ t: 'control', callId: msg.callId, control: { tag: 'closed', result } });
        } catch (err) {
          send({ t: 'error', callId: msg.callId, error: serializeError(err) });
        }
        return;
      }
      case 'abort': {
        aborts.get(msg.callId)?.abort(new AbortError('aborted by caller'));
        return;
      }
      case 'inspect': {
        send({
          t: 'control',
          callId: msg.callId,
          control: { tag: 'inspect', slots: pool.inspect() },
        });
        return;
      }
      case 'shutdown': {
        await pool.destroy();
        send({ t: 'control', callId: msg.callId, control: { tag: 'shutdown' } });
        // Let the control message flush before exiting.
        setTimeout(() => process.exit(0), 10);
        return;
      }
    }
  }

  // The memory heartbeat consumed by the recycle policy and memory gauges.
  // unref()'d: it must never keep a shutting-down host alive.
  const heartbeat = setInterval(() => {
    const mu = process.memoryUsage();
    send({ t: 'memory', rssBytes: mu.rss, heapUsedBytes: mu.heapUsed });
  }, config.memoryHeartbeatMs ?? 5_000);
  heartbeat.unref();

  send({
    t: 'ready',
    protocol: HOST_PROTOCOL_VERSION,
    pid: process.pid,
    // `version:target` from the runtime's own build-id subpath — both
    // axes matter: deployments sharing a database can run different
    // native binaries, and target-specific crashers must never pool or
    // reset journal state across architectures.
    engineBuild: engineRuntimeBuildId(),
  });
})().catch((err: unknown) => {
  send({ t: 'init-error', error: String((err as Error)?.stack ?? err) });
  process.exit(1);
});
