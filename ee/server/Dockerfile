# syntax=docker/dockerfile:1
#
# Multi-stage image for @cloudpdf/server.
#
# Build it ALWAYS from monorepo source (npm is a parallel SDK channel,
# never a build input). Build context is the repo root:
#
#   docker build -f ee/server/Dockerfile -t cloudpdf-server:dev .
#
# Cross-build for linux/amd64 from another arch (e.g. Apple Silicon):
#
#   docker buildx build --platform linux/amd64 \
#     -f ee/server/Dockerfile -t cloudpdf-server:dev --load .
#
# Native PDFium acquisition is selected with --build-arg NATIVE_SRC=...
#   build    (default) fetch the pinned thread-local libpdfium + compile
#            the N-API addon in-image. Fully self-contained, needs the
#            C++ toolchain. Used for local/dev builds.
#   prebuilt reuse a CI-produced packages/engine/runtime/npm/linux-x64/lib
#            payload that is staged into the build context before build.
#            Faster, and pins the image to the exact released binary.
#
# Target platform is always linux-x64 / glibc (Debian), because the
# native deps (libpdfium.so, better-sqlite3, sharp/libvips) are glibc.

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# Stage 1: builder - install the workspace, acquire the native runtime,
# build the server + its dependency closure, and assemble a self-contained
# /prod app directory.
#
# We build from the FULL monorepo context rather than a `turbo prune`
# subgraph: `pnpm deploy --prod` mis-prunes (it drags in the whole dev
# closure) against a pruned workspace, but prunes correctly against the full
# workspace. The build context is the same size either way (prune still
# needs `COPY . .`), so this only trades a little install-layer caching.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm AS builder
ARG NATIVE_SRC=build
WORKDIR /repo
# clang + lld are required by the native build: generate-functions.mjs
# shells out to `clang` for an AST dump, and cmake-js links with lld
# (matches .github/workflows/build-pdf-runtime.yml).
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      cmake build-essential clang lld python3 ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Full monorepo source (the .dockerignore trims caches/outputs/submodules).
COPY . .
# Drop the publish-auth .npmrc: a from-source build needs no registry token,
# and keeping it would force an ${NPM_TOKEN} substitution.
RUN rm -f .npmrc && pnpm install --frozen-lockfile

# Acquire the linux-x64 native PDFium runtime (pdf-runtime.node + libpdfium.so).
#   build    -> fetch the pinned thread-local libpdfium + compile the addon.
#   prebuilt -> CI staged the lib payload into npm/linux-x64/lib before build
#               (it arrives via the COPY above); just verify it is present.
RUN set -eux; \
    if [ "$NATIVE_SRC" = "prebuilt" ]; then \
      test -f packages/engine/runtime/npm/linux-x64/lib/pdf-runtime.node \
        || { echo "NATIVE_SRC=prebuilt but no prebuilt lib in build context" >&2; exit 1; }; \
    else \
      CC=clang CXX=clang++ LDFLAGS=-fuse-ld=lld \
        pnpm --filter @embedpdf/engine-runtime build:target linux-x64; \
    fi; \
    test -f packages/engine/runtime/npm/linux-x64/lib/pdf-runtime.node; \
    test -f packages/engine/runtime/npm/linux-x64/lib/libpdfium.so

# Build the server and its workspace dependency closure. The `<pkg>...`
# suffix selects @cloudpdf/server + everything it depends on, and pnpm runs
# recursive builds in topological order (dependencies first). The external
# @embedpdf/* deps must have their dist/types built both for the server's
# dts build and for runtime import resolution after deploy. (We avoid turbo
# here: its Rust binary hits EINTR creating .turbo dirs under QEMU emulation.)
RUN pnpm --filter "@cloudpdf/server..." run build

# Assemble a self-contained production app directory in /prod (dist + prod
# node_modules incl. the native package, sharp, sqlite). --legacy is required:
# the repo does not set inject-workspace-packages, so the new deploy
# implementation would refuse to run.
# The linux-x64 platform package is an optional transitive dependency of
# @embedpdf/engine-runtime, so pnpm is not required to root-link it under
# /prod/node_modules. Verify the real runtime contract instead: pdf-runtime can
# resolve its platform addon, and libpdfium.so sits beside the addon for RPATH.
RUN pnpm --filter=@cloudpdf/server deploy --prod --legacy /prod \
 && test -f /prod/dist/bin/cloudpdf-server.js \
 && cd /prod \
 && node -e "\
const fs = require('node:fs'); \
const path = require('node:path'); \
const { createRequire } = require('node:module'); \
const runtimeRequire = createRequire(require.resolve('@embedpdf/engine-runtime')); \
const addon = runtimeRequire.resolve('@embedpdf/engine-runtime-linux-x64'); \
const so = path.join(path.dirname(addon), 'libpdfium.so'); \
if (!fs.existsSync(addon)) throw new Error('missing addon: ' + addon); \
if (!fs.existsSync(so)) throw new Error('missing libpdfium.so: ' + so); \
console.log('native runtime package resolved:', addon); \
"

# ---------------------------------------------------------------------------
# Stage 2: runtime - slim glibc base + fonts, non-root, /data volume.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

# fontconfig + base/CJK fonts so PDFium renders non-embedded glyphs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      fontconfig \
      fonts-dejavu-core \
      fonts-liberation \
      fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*

# Zero-config production defaults: SQLite + filesystem + local cache under
# /data, auto-migrate on. Override any of these for Postgres / S3 / etc.
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    CLOUDPDF_DB_SQLITE_PATH=/data/cloudpdf.db \
    CLOUDPDF_STORAGE_FS_ROOT=/data/objects \
    CLOUDPDF_CACHE_ROOT=/data/cache \
    CLOUDPDF_AUTO_MIGRATE=1

COPY --from=builder /prod /app
RUN mkdir -p /data && chown -R node:node /data /app
USER node

VOLUME ["/data"]
EXPOSE 3000

# Node's built-in fetch (no curl in bookworm-slim). Generous start-period
# covers native worker boot + first auto-migration.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node","-e","fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Default to `serve`, but keep argv overridable so `docker run img migrate up`,
# `db doctor`, etc. work. Run with `--init` for signal/zombie hygiene.
ENTRYPOINT ["node", "dist/bin/cloudpdf-server.js"]
CMD ["serve"]
