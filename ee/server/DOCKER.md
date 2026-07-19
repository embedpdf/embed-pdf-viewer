# Running `@cloudpdf/server` with Docker

The server ships as a self-contained Docker image. A consumer only needs
`docker pull` + `docker run` - no repo, Node, pnpm, or PDFium toolchain.
The Node 22 runtime, the bundled `dist`, production `node_modules`, the
native `libpdfium.so` + `pdf-runtime.node`, `sharp`, `better-sqlite3`, and
fonts are all baked in.

## Build

The image is **always built from monorepo source**, with the **repo root**
as the build context:

```bash
# from the repo root
docker build -f ee/server/Dockerfile -t cloudpdf-server:dev .
```

On Apple Silicon / non-amd64 hosts, cross-build for the release platform:

```bash
docker buildx build --platform linux/amd64 \
  -f ee/server/Dockerfile -t cloudpdf-server:dev --load .
```

### How the context is trimmed

`ee/server/Dockerfile.dockerignore` (a BuildKit per-Dockerfile ignore that
applies to the repo-root context) drops `node_modules`, build outputs,
`.git`, the giant `pdfium-src` / `runtime-src` submodules, and framework
build dirs that contain stray nested `package.json` files. All workspace
`package.json` files are kept so the workspace graph still resolves.

> A plain `ee/server/.dockerignore` would be ignored here, because it only
> applies when the build context itself is `ee/server`. We build from the
> repo root, so the ignore lives next to the Dockerfile as
> `Dockerfile.dockerignore`.

### Stages

1. **builder** - installs from the full workspace, acquires the native
   runtime (see below), builds the `@cloudpdf/server` dependency closure, then
   runs `pnpm deploy --prod --legacy /prod` to assemble a portable app
   directory. The full workspace is intentional: `pnpm deploy --prod` behaved
   more predictably here than the pruned workspace, and the Dockerfile-specific
   ignore keeps the build context bounded.
2. **runtime** - `node:22-bookworm-slim` + fonts, non-root `node` user,
   `/data` volume, `CLOUDPDF_*` defaults, Node-`fetch` healthcheck.

### Native PDFium acquisition (`--build-arg NATIVE_SRC=`)

| Value             | Behaviour                                                                 | Used by    |
| ----------------- | ------------------------------------------------------------------------- | ---------- |
| `build` (default) | Fetch the pinned thread-local `libpdfium.so` and compile the N-API addon. | local/dev  |
| `prebuilt`        | Reuse a CI-staged `packages/pdf-runtime/npm/linux-x64/lib` payload.       | CI/release |

For `prebuilt`, stage the artifact into the build context first:

```bash
# CI downloads the build-runtime job's pdf-runtime-linux-x64 artifact into:
#   packages/pdf-runtime/npm/linux-x64/
docker build -f ee/server/Dockerfile \
  --build-arg NATIVE_SRC=prebuilt -t cloudpdf-server:1.2.3 .
```

> The pinned libpdfium **must** be the thread-local-globals build so the
> multi-worker pool (`CLOUDPDF_WORKER_POOL_SIZE`) is safe. See
> [THREAD_CONFINED_RUNTIME.md](./THREAD_CONFINED_RUNTIME.md).

## Run

Zero-config (SQLite + filesystem + local cache under `/data`):

```bash
docker run --rm --init -p 3000:3000 \
  -v cloudpdf-data:/data \
  -e CLOUDPDF_JWT_SECRET=change-me \
  cloudpdf-server:dev
```

`--init` gives proper signal/zombie hygiene (the server already handles
`SIGTERM`/`SIGINT`).

The entrypoint is the CLI, so non-`serve` commands work too:

```bash
docker run --rm -v cloudpdf-data:/data cloudpdf-server:dev migrate status
docker run --rm -v cloudpdf-data:/data cloudpdf-server:dev db doctor
```

### Scaling to production (env-only)

```bash
docker run -d --init -p 3000:3000 \
  -e CLOUDPDF_JWT_SECRET=... \
  -e CLOUDPDF_DB_DRIVER=postgres -e CLOUDPDF_DB_URL=postgres://... \
  -e CLOUDPDF_AUTO_MIGRATE=0 -e CLOUDPDF_FAIL_ON_PENDING=1 \
  -e CLOUDPDF_STORAGE_KIND=s3 -e CLOUDPDF_STORAGE_S3_BUCKET=... \
  -e CLOUDPDF_WORKER_POOL_SIZE=max \
  cloudpdf-server:1.2.3
```

Run migrations explicitly before rolling out new replicas:

```bash
docker run --rm -e CLOUDPDF_DB_DRIVER=postgres -e CLOUDPDF_DB_URL=postgres://... \
  cloudpdf-server:1.2.3 migrate up
```

See `cloudpdf-server --help` (or [the CLI source](./src/bin/cloudpdf-server.ts))
for the full `CLOUDPDF_*` surface.

## Image tags

Released images are published to GitHub Container Registry by the release
workflow (`.github/workflows/release.yml`):

```
ghcr.io/embedpdf/cloudpdf-server:<x.y.z>
ghcr.io/embedpdf/cloudpdf-server:<x.y>
ghcr.io/embedpdf/cloudpdf-server:latest
```

Pre-release candidates are pushed from the `next` channel as
`:<x.y.z>-next.<n>`, `:next`, and `:sha-<short>`. Pin a **digest**
(`@sha256:...`) in production; never run `:latest`.

### Build-once, promote-by-digest

Prefer promoting the exact bytes you tested over rebuilding. Test a
candidate digest (e.g. the `next` image), then re-tag that digest to the
release tag without a rebuild:

```bash
docker buildx imagetools create \
  --tag ghcr.io/embedpdf/cloudpdf-server:1.2.3 \
  ghcr.io/embedpdf/cloudpdf-server@sha256:<tested-digest>
```

This guarantees the shipped image equals the tested image. Deployments
(Helm/Compose) should reference the digest, not a moving tag.
