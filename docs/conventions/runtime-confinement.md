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
   (wired in `packages/engine/services/src/runtime/lifecycle/bootstrap.ts`).
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
  `packages/engine/runtime/runtime-src/scripts/embedpdf-runtime/build-target.sh`.
  wasm needs nothing — each instance already isolates globals via its own
  linear memory.

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
   in `packages/engine/runtime/runtime-src/core/fxcodec/icc/icc_transform.cpp`).

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
- **Thread confinement is not crash isolation:** a malformed-PDF segfault kills
  the process that owns the worker threads. Inline mode therefore loses the API
  process and all workers. Host mode moves the worker pool into supervised child
  processes, but all workers within one host still share its crash domain. See
  [`engine-host-isolation.md`](./engine-host-isolation.md).
- Keep `pdf_use_partition_alloc=false` (or make `g_allocators` thread_local if
  it is ever re-enabled).
