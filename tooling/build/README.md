# @embedpdf/tooling-build — the one build preset

`epdf-build` turns a publishable TS package into dual ESM+CJS with
declarations, and proves the result on every build. [`plugins.md`](../../docs/conventions/plugins.md) is the law for
plugin authors; this file is the law for how packages BUILD.

## The laws

1. **The `exports` map is the source of truth.** It lists the curated public
   entries as `./src/*.ts(x)` paths. epdf-build derives its entry list from
   that map — there is no second entry list anywhere. Everything not listed is
   internal, wherever it lives under `src/`.
2. **package.json exports are OUTPUT.** tsdown regenerates both sides on every
   build: dev exports (source-first) in place, publish exports (dist,
   `import` + `require`) into `publishConfig`. Never hand-edit either; add an
   entry by adding the file and one `"./name": "./src/name.ts"` line, then
   build.
3. **Every build is a package audit.** publint and attw (`node16` profile,
   error level) run in-build. A package that builds is a package whose
   published types resolve — there is no separate check to forget. The `node16`
   profile is v3's documented floor: TS ≥ 4.7 with `node16`/`bundler`
   resolution; legacy `node10` resolution is not supported.
4. **Two dev-exports modes** (see `epdf` field below):
   - Default (client stack): pure source-first. Workspace consumers resolve TS
     source everywhere — no watch builds, and consumer tsconfigs typecheck your
     source, which is safe because the client stack shares one lib discipline
     (narrow libs ARE the DOM-free purity guard — do not widen a consumer's
     libs to accommodate a dependency; that package belongs in the other mode).
   - `"devExports": "development"` (engine family): condition-split for
     boundary packages whose source needs wider libs (DOM, ES2022) than their
     consumers allow. TS resolves dist `.d.ts` (shielded by `skipLibCheck`),
     Vite's dev server still reads source for HMR via the `development`
     condition. Requires dist to exist — `turbo run build` handles ordering.
5. **Plugin contracts are real entries, not naming conventions.** Every plugin
   publishes `./contract`; plugins with a wider sibling protocol may also
   publish `./contract/host`. The root remains the implementation opt-in and
   re-exports `./contract`. `/internal` is only an API-visibility boundary and
   may contain implementation code. Named pure/helper entries such as
   `/destination` are allowed when the contract is the wrong abstraction.
   `pnpm check:plugin-boundaries` verifies imports and follows each contract's
   runtime graph so reducers, capabilities, effects, and plugin wiring cannot
   leak into it.

## Package setup

```jsonc
{
  "scripts": { "build": "epdf-build" },
  "devDependencies": { "@embedpdf/tooling-build": "workspace:*" },
  "sideEffects": false,
  "exports": {
    ".": "./src/index.ts",
    "./contract": "./src/contract.ts"
  }
}
```

## The `epdf` field (escape hatches — keep rare)

```jsonc
{
  "epdf": {
    // Subpaths shipped VERBATIM in both dev and publish maps, excluded from
    // build and attw — e.g. a worker entry published as TS source for the
    // consumer's bundler to compile (engine's ./worker-entry).
    "rawExports": ["./worker-entry"],
    // Condition-split dev exports (law 4). Engine family only.
    "devExports": "development"
  }
}
```

## Outside this preset, on purpose

- `framework/angular` — ng-packagr (the platform's own library builder).
- `framework/vue` — Vite library build + vue-tsc declarations; `framework/svelte` —
  svelte-package. Both finish and prove their `dist` with two scripts here (below).
- `engine/runtime` (pdf-runtime) — bespoke emscripten/wasm build.
- Apps, examples, viewers — Vite app builds; they are consumers, not libraries.

### Vue and Svelte: finishing and proving `dist`

Their builders keep each import as the source writes it, and their workspace
`exports` point at the source, so nothing in the workspace ever reads their
`dist`. Each package's `build` script therefore ends with:

- `src/fully-specify-imports.mjs` — every relative import in `dist` names its
  file (`./stage/scope.js`), as Node, webpack and TypeScript's `node16` need;
  `--cjs-types` (Vue) also writes the `.d.cts` declarations a `require` reads.
- `src/check-framework-package.mjs` — the publish check: packs the package,
  checks the manifest (every export names a shipped file with its types, no
  `workspace:` range, every imported package declared), runs publint and attw
  (law 3's profile; `.svelte` component imports are left to Svelte's tooling),
  and type-checks the package's `consumer/` app against the tarball with
  `vue-tsc` or `svelte-check` and `skipLibCheck: false`. Lines marked
  `// error expected` must fail, so types that went `any` fail the build.
