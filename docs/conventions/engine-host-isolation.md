# Engine-host isolation

Thread confinement makes parallel PDFium use correct; it does not make native
crashes safe. Host isolation moves the thread-confined `WorkerThreadPool` into
one or more supervised child processes so an engine crash does not kill the API
process. Enable it with `CLOUDPDF_ENGINE_ISOLATION=host`; use
`CLOUDPDF_ENGINE_SHARDS` to partition documents across multiple supervised
hosts. The thread-ownership rules in
[`runtime-confinement.md`](./runtime-confinement.md) still apply inside every
host.

The implementation lives in `cloudpdf/server/src/runtime/EngineHostClient.ts`,
`cloudpdf/server/src/runtime/ShardedEnginePool.ts`, and
`cloudpdf/server/src/runtime/engine-host-entry.ts`.

## Threat model: what a compromised engine can reach

PDFium parses attacker-controlled bytes; assume an eventual RCE in the engine
process and design for containment, honestly labelled.

### Credential-exposure reduction

- The host child is forked with a whitelisted environment: no
  `CLOUDPDF_DB_URL`, JWT secret, license key, or object-store credentials.
  `hostEnvWhitelist` applies the allowlist, integration tests assert the child
  environment, and `NODE_OPTIONS` is stripped so an inherited `--inspect`
  cannot open a debug port in the engine process.
- This is exposure reduction, not a hard security boundary. The engine is a
  same-container, same-UID child. Whether it can read the API process's memory
  or `/proc/<pid>/environ` depends on the kernel's ptrace policy
  (`kernel.yama.ptrace_scope`, a node-level sysctl in Kubernetes). `HOME` and
  the container filesystem remain shared. Marking the API process non-dumpable
  (`PR_SET_DUMPABLE=0`) would close same-UID `/proc` access independently of
  Yama, but is not currently part of this boundary.
- Durable state integrity is a hard property: a lying engine can corrupt its
  own outputs, but the write pipeline's generation fence and version CAS keep
  it from silently blessing stale state as committed.

### Reachable surfaces

- The pod network. NetworkPolicy can narrow pod egress, but the engine can
  still reach API-process ports inside the pod.
- The base and layer cache files it renders from, plus its IPC channel to the
  parent. Treat rendered output as untrusted content.
- The kernel syscall surface, minus seccomp `RuntimeDefault`. A sandbox runtime
  such as gVisor or Kata, configured through `runtimeClassName`, strengthens
  pod-to-node isolation at syscall-emulation cost. It applies to the whole pod;
  it does not isolate the engine from the API process inside that pod.

### Non-boundaries

- In-process Node sandboxing, including the permission model and frozen
  intrinsics, is not a security boundary against native code.
- A sidecar split does not by itself create an intra-pod network boundary:
  ordinary Kubernetes NetworkPolicy cannot distinguish containers in the same
  pod. Re-evaluate a separate-pod engine tier if a hard network and identity
  boundary becomes a requirement.

## Crash and overload blast radius

- A host crash rejects in-flight work retryably and triggers a backoff-capped,
  sub-second respawn.
- Multiple shards reduce the resident-document blast radius because each host
  owns only its rendezvous-hashed partition. Any persistently unavailable shard
  makes the pod unready; requests do not fail over to a different shard inside
  the same pod.
- Repeated sole-suspect crashes are journaled and quarantined by
  `(base_sha, engine_build)`.
- Admission control sheds overload with retryable 503 responses instead of
  queueing without a bound.

Operational rollout, sizing, recycling, and metrics live in
`cloudpdf/server/deploy/helm/DEPLOY.md`.
