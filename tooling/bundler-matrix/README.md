# Bundler matrix

Does the zero-config local engine — its worker, its wasm — and the built-in
stamp library work **out of the box** under each toolchain, under a strict
Content-Security-Policy, without a single request leaving the app's own origin?
One minimal app per bundler, the same probe in each (`probe/probe.js`), a
production build, a headless browser, and a truth table. Every asset-delivery
decision is checked here, not argued.

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
- `esbuild+viewer/portable` — the whole viewer from `@embedpdf/viewer/portable`,
  the entry Self-hosting gives plain esbuild, through `probe/viewer.js`: it opens
  a PDF served beside the page and waits for a page to show, opens the stamps
  panel until the standard stamps are in, and saves a signature typed in each
  default handwriting font, checking that the saved PDF embeds the font.

The `wasm delivery` column tells the two apart: `emitted asset` or
`inline chunk`. `Off-origin` must always read `none` — a request that leaves
the app's origin is a failure of the delivery model, whatever else passed.

## Dev servers

A variant with `dev` in place of `script` runs the app's dev server, not a
build: `angular+serve` (`ng serve`) and `vite+dev`. Both prebundle packages
with Vite's optimizer, which up to Vite 7 moves a package into a cache folder
and leaves its worker files and `embedpdf.wasm` behind. The engine has to see
that and start from `blob:` workers and its dev copy of the WebAssembly
(`@embedpdf/engine/dev-wasm`).

A dev server prebundles only what comes from `node_modules`, and inside this
workspace the packages are links with the workspace `package.json`. So a dev
row runs on a copy of the app outside the workspace (`dev-server.mjs`): it
packs every workspace package the app depends on, which writes each one's
published `package.json`, installs the copy from those packs with npm, and
starts `npm run <dev> -- --port <port>` there. It needs the registry for the
app's other dependencies.

The copy starts with neither `NODE_ENV` nor `CI` set, as a developer's shell
has them, and the Angular app turns its build cache on for every environment:
the Angular CLI prebundles nothing without that cache, and turns it off where
`CI` is set.

A dev row has no policy (a dev server adds scripts of its own to the page),
and no sizes. `wasm delivery` reads `inline chunk` where the engine started
from its dev copy and `file in node_modules` where the dev server served the
file, as Vite 8 does. A dev row has to boot: the runner exits non-zero when
one doesn't.

## The strict policy

Every app is served with the Content-Security-Policy from
[Security & CSP](../../docs/content/viewer/concepts/security.mdx), Trusted Types
enforced, on every response (a worker file runs under its own response's
policy). The runner listens for `securitypolicyviolation` from before the app's
first script, and reads the browser's log for violations inside workers. One
violation fails the row.

Each `matrix.json` entry (app and variant alike) states what the build needs
beside that policy:

- `workerSrc` (required): `'self'` where the bundler emits the engine's worker
  files; `'self' blob:` where the build starts them from `blob:` URLs, which is
  the portable engine (Angular, `esbuild+portable`, `esbuild+viewer/portable`).
- `trustedTypes`: the bundler's own Trusted Types policies, added to
  `trusted-types` (webpack and Rspack load lazy chunks through
  `output.trustedTypes`; Next's webpack build creates `nextjs#bundler`).
- `enforceTrustedTypes: false`: Turbopack's runtime sets `script.src` without
  any policy, so its row leaves out `require-trusted-types-for`.

Inline scripts in the build's own `index.html` (Parcel's import map, Next's
bootstrap) are allowed by their hashes, as a static host lists them. The `CSP`
column shows each row's `worker-src` and these additions.

The runner exits non-zero when a row makes an off-origin request or violates the
policy: the two guarantees every row keeps, whether or not its zero-config boot
works. It also does when a dev row fails to boot.
