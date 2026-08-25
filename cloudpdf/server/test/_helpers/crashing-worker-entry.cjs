/**
 * Fail-fast test double: a worker whose death is scriptable.
 *
 *   {kind:'park'}       -> never replies (leaves the job in flight)
 *   {kind:'die', code}  -> process.exit(code) — thread death, no reply
 *   {kind:'shutdown'}   -> ack + exit(0) (the destroy() handshake)
 *
 * Anything else resolves with a trivial payload.
 */
const { parentPort } = require('node:worker_threads');

parentPort.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.kind === 'park') return;
  if (msg.kind === 'die') process.exit(msg.code ?? 1);
  parentPort.postMessage({ kind: 'resolve', jobId: msg.jobId, result: null });
  if (msg.kind === 'shutdown') process.exit(0);
});

parentPort.postMessage({ kind: 'ready' });
