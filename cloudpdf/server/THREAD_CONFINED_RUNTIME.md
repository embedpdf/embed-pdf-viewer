# Thread-confined PDFium runtime

This server can render PDFs on **N worker threads in a single process**, in
parallel, with zero-copy `postMessage` transfer. This is not "thread-safe
PDFium" (upstream is explicit that its APIs are not thread-safe). Instead the
native runtime is built so that **each worker thread owns its own PDFium state**
and never shares PDFium handles across threads — a _thread-confined_ (shared-
nothing) contract under which N workers run safely in parallel.

## The contract

1. Each worker thread calls `EPDF_InitThread` before using PDFium and
   `EPDF_ShutdownThread` after closing every handle it created
   (wired in `packages/engine-services/src/runtime/lifecycle/bootstrap.ts`).
2. No document, page, bitmap, annotation, text page, content parser, or font
   object may cross workers.
3. The pool enforces this: a doc is pinned to one worker via sticky-by-docId
   routing in `cloudpdf/server/src/runtime/WorkerThreadPool.ts`.

Two things are private-per-thread, which together make parallel rendering safe:
the **handles** we create (pinned per worker) and PDFium's internal **globals**
(made `thread_local` in the native build).

## How it's built (per-target opt-in)

Per-thread globals are gated behind a real GN arg, **default off**:

- Declared in `packages/engine/runtime/runtime-src/pdfium.gni`
  (`embedpdf_thread_local_globals = false`).
- Translated to the `EPDF_THREAD_LOCAL_GLOBALS` define in
  `packages/engine/runtime/runtime-src/BUILD.gn`, consumed by the `EPDF_TLS` macro
  (`core/fxcrt/epdf_tls.h`).
- Turned **on per native target** (and left **off for wasm**) by
  `scripts/embedpdf-runtime/build-target.sh`. wasm needs nothing — each instance
  already isolates globals via its own linear memory.

Flag-on is a superset: the build still runs correctly single-threaded. Default
off keeps every other target and upstream rebases byte-for-byte unchanged.

## Configuring the worker pool

Worker count resolves as: explicit `size` option → `CLOUDPDF_WORKER_POOL_SIZE`
env → conservative default `min(2, cpus)`.

```bash
# one worker per CPU (after the gate below is green for your native build)
CLOUDPDF_WORKER_POOL_SIZE=max   # or an explicit integer, e.g. 8
```

Keep the conservative default until you have validated the thread-confined
native build with the gate below.

## The gate (run before scaling in production)

Fix-then-verify order — the two known addon/runtime data races are already fixed
(`g_napi_lossless` made a per-call local; default `localtime` made thread-safe),
so a TSAN run surfaces PDFium findings rather than masking them.

1. **Threaded soak** (`testing/tools:epdf_thread_soak`) — multi-thread
   init/open/render/**encrypted-save**/close. The encrypted-save path exercises
   the now doc-owned pending-security state across threads.

   ```bash
   # plain build, native target (defaults EMBEDPDF_TLS_GLOBALS=true)
   packages/engine/runtime/runtime-src/scripts/embedpdf-runtime/thread-soak-target.sh \
     darwin-arm64 path/to/icc-and-font-heavy.pdf -- --threads=8 --iterations=200

   # under ThreadSanitizer (the gate)
   EMBEDPDF_TSAN=1 \
   packages/engine/runtime/runtime-src/scripts/embedpdf-runtime/thread-soak-target.sh \
     linux-x64 path/to/icc-and-font-heavy.pdf -- --threads=8 --iterations=200
   ```

   Use ICC-heavy PDFs to cover the LCMS default-context path (see the gate note
   in `core/fxcodec/icc/icc_transform.cpp`).

2. **Single-thread regression** — run the embeddertests to confirm the
   `thread_local` variant is still correct single-threaded:

   ```bash
   packages/engine/runtime/runtime-src/scripts/embedpdf-runtime/test-target.sh linux-x64
   # baseline (process-global) comparison:
   EMBEDPDF_TLS_GLOBALS=false \
     packages/engine/runtime/runtime-src/scripts/embedpdf-runtime/test-target.sh linux-x64
   ```

Only after TSAN + soak are green should you raise the pool size in production.

## Load-test methodology

Compare throughput/latency across three configurations on representative
(ICC-heavy, font-heavy, encrypted-save) corpora:

- `CLOUDPDF_WORKER_POOL_SIZE=1` — single worker baseline.
- `CLOUDPDF_WORKER_POOL_SIZE=max` — one thread-confined worker per CPU.
- A process-pool deployment (multiple single-thread pods/processes) — the
  crash-isolated comparison point.

Track p50/p95/p99 latency, sustained throughput, and **RSS** (per-thread memory
matters — see below).

## Tradeoffs

- **Per-thread memory:** each thread duplicates the GEModule (FreeType + font
  caches), CMaps, stock colorspaces, and the opcode table. N threads ≈ N× that
  font/cmap footprint. Size the pool (and pod memory) accordingly.
- **No crash isolation:** a malformed-PDF segfault still kills the whole
  process and all its workers. Mitigate with horizontal pod scaling (fault
  domains) and bounded threads-per-pod. Where hard isolation is required, prefer
  a process pool (multiple single-thread pods) over a large in-process pool.
- Keep `pdf_use_partition_alloc=false` (or make `g_allocators` thread_local if
  it is ever re-enabled).

## Threat model: what a compromised engine can reach

PDFium parses attacker-controlled bytes; assume an eventual RCE in the
engine process and design for containment, honestly labelled.

**Credential-exposure reduction (built, test-asserted — honestly scoped):**

- The host child is forked with a whitelisted env — no `CLOUDPDF_DB_URL`,
  no JWT secret, no license key, no object-store credentials
  (`hostEnvWhitelist`; the integration suite asserts the child's env
  snapshot), and `NODE_OPTIONS` is stripped so an inherited `--inspect`
  cannot open a debug port in the engine process. The engine cannot
  authenticate with credentials inherited through its OWN environment.
- This is exposure REDUCTION, not a hard boundary: the engine is a
  same-container, same-UID child. Whether it can read the API process's
  memory or `/proc/<pid>/environ` is gated by the kernel's ptrace access
  policy (`kernel.yama.ptrace_scope`, a NODE-level sysctl in
  Kubernetes) — commonly restrictive, not guaranteed. `HOME` and the
  container filesystem remain shared. A documented follow-up hardening
  is marking the API process non-dumpable (`PR_SET_DUMPABLE=0`), which
  closes same-UID `/proc` access regardless of Yama policy.
- Durable state integrity IS a hard property: a lying engine can corrupt
  its own outputs, but the write pipeline's generation fence and version
  CAS mean it cannot silently bless stale state as committed.

**What it CAN reach (containment is the deployment's job):**

- The pod network (NetworkPolicy narrows it; in-pod it can reach the API
  process's ports).
- The base/layer cache files it renders from (read), and its IPC channel
  to the parent (it can lie in results — clients must treat rendered
  output as untrusted content, which browsers do by construction).
- The kernel syscall surface, minus seccomp `RuntimeDefault`. A sandbox
  runtime (`runtimeClassName`: gVisor/Kata) adds kernel-exploit
  containment at syscall-emulation cost — scoped honestly: RuntimeClass
  applies to the POD's containers, strengthening pod-to-node isolation;
  it does not separate the engine from the API process inside the pod.

**Honest non-layers:** in-process Node sandboxing (permission model,
frozen intrinsics) is theater against native code and is not used as a
security boundary. A sidecar-container split was evaluated and NOT
built: Kubernetes NetworkPolicy cannot distinguish containers within a
pod, so the network edge it intuitively promises is not delivered; the
env whitelist already provides the secrets boundary. Revisit on
enterprise pull.

**Blast-radius mechanics (built):** a crash costs one engine respawn
(sub-second, backoff-capped); repeat crashers are quarantined by
`(base_sha, engine_build)` with sole-suspect attribution; admission
control sheds overload as 503s instead of queueing unboundedly.
