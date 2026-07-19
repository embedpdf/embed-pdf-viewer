# Package naming — the law

`PLUGINS.md` is the law for plugin authors, `ADAPTERS.md` for adapter authors,
`tooling/build/README.md` for how packages build. This file is the law for
WHERE a package lives and WHAT it is called. Every name derives from the tree;
if you have to debate a name, the tree is wrong.

## The three clauses

1. **A package's npm name is its repo path with dashes.**
   `packages/plugin/stage` → `@embedpdf/plugin-stage`,
   `packages/core/geometry` → `@embedpdf/core-geometry`,
   `packages/engine/services` → `@embedpdf/engine-services`.
2. **`packages/<group>/main` is the group's namesake: `@embedpdf/<group>`.**
   `core/main` is the kernel (`@embedpdf/core`); `engine/main` is the default
   local-wasm engine (`@embedpdf/engine`). Groups without a principal package
   simply have no `main/`.
3. **`framework/` packages are bare-named** — `@embedpdf/react`, `/vue`,
   `/svelte`, `/angular`, `/web`. They are the marquee surface an app installs;
   the group prefix would only be noise on npm.

## The groups

| Group        | What belongs there                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/`      | Framework-free, DOM-free client logic (the Rust-portable layer): kernel, geometry, feature cores, acrojs, js-sandbox. Narrow `lib` in tsconfig IS the purity guard — never widen it to accommodate a dependency. |
| `engine/`    | The PDF engine family: contract (`core`), default engine (`main`), services, wasm/napi runtime (`runtime` + its `npm/*` target sidecars).                                                                        |
| `plugin/`    | Kernel plugins, framework-free. Directory drops the `plugin-` prefix (the group says it); npm names keep it.                                                                                                     |
| `framework/` | ALL framework-specific code (ADAPTERS.md). Nothing framework-flavored exists outside this group.                                                                                                                 |

Examples (`examples/*`) and internal tooling (`tooling/*`) are not part of the
law's namespace: examples are `@embedpdf/example-<dir>` and private; tooling is
`@embedpdf/tooling-<dir>` and private.

## Corollaries

- Adding a package = choosing its group; the name falls out. A package that
  fits no group is a design conversation, not a naming one.
- Renames after 3.0.0 ships are breaking changes; before that they are free.
  This law was locked while everything was at 0.0.0 — keep it locked.
- The changeset `fixed` group in `.changeset/config.json` enumerates every
  `@embedpdf/*` publishable — one version for the whole SDK, engine included.
