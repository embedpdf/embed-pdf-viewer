# Bundler matrix

Does the zero-config local engine — its worker, its wasm — and the built-in
stamp library work **out of the box** under each toolchain, without a single
request leaving the app's own origin? One minimal app per bundler, the same
probe in each (`probe/probe.js`), a production build, a headless browser, and a
truth table. Every asset-delivery decision is checked here, not argued.

```sh
pnpm --filter @embedpdf/bundler-matrix matrix                 # every app
pnpm --filter @embedpdf/bundler-matrix matrix:one vite,angular
node run.mjs --script matrix:build:assets --only angular     # the documented Angular fast path
```

Needs a Chromium: Playwright's own (`pnpm exec playwright-core install chromium`)
or a local Google Chrome. Results land in `results.json` and as a markdown
table on stdout.

The apps' build scripts are named `matrix:build` on purpose: turbo's `build`
task must not pick them up.

## Variants

Beside every zero-config row, an app may declare documented opt-ins in its
`matrix.json` (`variants`), each a build script of its own:

- `angular+assets` — the one-line `angular.json` asset glob plus `assetsUrl`,
  the fast path (emitted asset, streamed).
- `angular+portable`, `esbuild+portable` — `@embedpdf/engine/portable`: the
  wasm as a lazy JS chunk of the app, for toolchains that cannot emit it as an
  asset. Zero configuration; costs the same over the wire, no streaming compile.

The `wasm delivery` column tells the two apart: `emitted asset` or
`inline chunk`. `Off-origin` must always read `none` — a request that leaves
the app's origin is a failure of the delivery model, whatever else passed.
