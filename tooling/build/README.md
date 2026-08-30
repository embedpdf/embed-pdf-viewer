# @embedpdf/tooling-build — the one build preset

`epdf-build` turns a publishable TS package into dual ESM+CJS with
declarations, and proves the result on every build. [`plugins.md`](../../.agents/skills/embedpdf-conventions/references/plugins.md) is the law for
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

## Package setup

```jsonc
{
  "scripts": { "build": "epdf-build" },
  "devDependencies": { "@embedpdf/tooling-build": "workspace:*" },
  "sideEffects": false,
  "exports": { ".": "./src/index.ts" }
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
- future `framework/svelte` — svelte-package.
- `engine/runtime` (pdf-runtime) — bespoke emscripten/wasm build.
- Apps, examples, viewers — Vite app builds; they are consumers, not libraries.
