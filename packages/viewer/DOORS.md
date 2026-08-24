# Doors — the law for the viewer product line

`NAMING.md` is the law for where a package lives, and
`tooling/build/README.md` for how packages build. This file is the law for
**how one viewer serves several deliveries**: EmbedPDF with the built-in
engine, CloudPDF with a remote one, a CDN snippet, and one wrapper per
framework — without forking the viewer once.

A **door** is an entry point that decides ONE thing: which engine is in the
bundle. Everything else is shared.

## The five laws

1. **One artifact, many doors.** There is a single viewer implementation. A
   door is an entry file, not a copy — if you are about to duplicate component
   or element code per delivery, stop; the difference belongs in a door.

2. **The kernel is door-blind.** Nothing under `kernel/` may import from
   `doors/` or `local/`, and the word "local" may not appear there. Same rule
   one level up: a framework wrapper's `component.*` imports the viewer for
   TYPES ONLY (`import type`), so it holds no runtime edge to any engine.

3. **A door declares its own truth.** A config type may only promise what that
   door's imports actually deliver. The local door's `engine` is optional and
   accepts the built-in engine's options bag; the `/core` door's is required and
   takes only a real `Engine | EngineFactory`. Both are called `ViewerConfig` —
   one name per door, so samples and docs never pick a door-specific type name.
   An engine's OPTIONS type lives next to the code that interprets it
   (`LocalEngineConfig` in `viewer/main/src/local`, `CloudEngineOptions` in
   `@cloudpdf/engine`), never in shared code.

4. **Doors never import doors.** Two deliveries that share a surface share a
   MODULE, not each other — that is why `local/surface.ts` exists and the npm
   and snippet doors both re-export it, differing only in the wasm default they
   register.

5. **The implementation sits at the widest type; doors narrow by assignment.**
   Parameter types are contravariant, so a function taking the wider config
   satisfies a narrower signature — never the reverse. Hence `initViewer` and
   `<PDFViewer>` are typed with the kernel's `ElementConfig` (engine seam
   `unknown`), and each door re-types them by assignment:

   ```ts
   const init: (options: InitOptions) => EmbedPdfViewerElement = initViewer;
   ```

   **If you find yourself writing `as` here, you have it backwards.**

## Why the element's engine seam is `unknown`

`EmbedPdfViewerElement` is one compiled class serving every door, so its
`.config` must carry a value only the sending door understands. It opens the
envelope far enough to recognise an `Engine` or a factory, and otherwise hands
it to the provider its door registered (`EmbedPdfViewerElement.defaultEngineProvider`,
set by `registerLocalEngine()`; the `/core` door sets none, which is exactly
what makes its `engine` required).

Typing that seam narrower would either forbid a legal door vocabulary or
advertise one a different door cannot honour. So the imperative `el.config =`
path stays opaque and runtime-checked on purpose; typed config belongs at
`init()` and `<PDFViewer>`, which are per-door.

## The shape

```
packages/viewer/main/src/
  kernel/     door-blind: element, config base, init, public surface
  local/      the built-in engine's vocabulary + registration (not an entry)
  doors/      ENTRIES ONLY — local.ts, core.ts, snippet.ts
```

Every framework wrapper is the same three files, in this order:

```
src/component.ts   the wrapper, engine-blind, `import type` only
src/index.ts       the local door:  import '@embedpdf/viewer';       + narrowed props
src/core.ts        the core  door:  import '@embedpdf/viewer/core';  + narrowed props
```

Read one wrapper and you have read them all.

## Checklist: adding a framework wrapper

1. `packages/viewer/<framework>` — the name falls out of `NAMING.md`
   (`@embedpdf/viewer-<framework>`).
2. `component.*`: types only from `@embedpdf/viewer/core`; props are
   `ElementConfig & <Framework>Extras`. Set `.config` before the element's
   deferred mount, so the viewer boots exactly once — make that an acceptance
   test.
3. `index.*` / `core.*`: one side-effect import each, then re-export the
   component narrowed to that door's `ViewerConfig`.
4. `package.json`: add `"./core": "./src/core.*"` to `exports` (the build
   derives entries from it — see `tooling/build/README.md`) and list BOTH door
   entries in `sideEffects`. A pure re-export barrel with `sideEffects: false`
   can be dropped by a bundler, taking the element registration with it.
5. Children pass through as LIGHT DOM. There is no slot bridge: a slot IS a
   child.
6. Prove both doors. A probe of `@ts-expect-error` lines is self-validating —
   if a door stops rejecting a bad shape, tsc fails with "unused directive".
   Assert the bundle too: the `/core` door must emit no `FPDF_` symbols and no
   wasm asset.

## Enforcement

`eslint.config.js` carries the import-boundary rules for laws 2 and 3
(`component.*` is `import type` only; `cloudpdf/**` may not import the local doors).
They are **latent until lint is wired up in CI** — there is no root
`tsconfig.json` and no `lint` script today, so treat the tree and the type
system as the real guardrails until that lands.
