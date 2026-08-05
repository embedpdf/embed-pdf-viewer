# Package naming — the law

`PLUGINS.md` is the law for plugin authors, and `tooling/build/README.md` for
how packages build. This file is the law for WHERE a package lives and WHAT it
is called. Every name derives from the tree; if you have to debate a name, the
tree is wrong.

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

| Group        | What belongs there                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/`      | Framework-free, DOM-free client logic (the Rust-portable layer): kernel, geometry, feature cores, acrojs, js-sandbox. Narrow `lib` in tsconfig IS the purity guard — never widen it to accommodate a dependency.                                                                                                                                                                        |
| `engine/`    | The PDF engine family: contract (`core`), default engine (`main`), services, wasm/napi runtime (`runtime` + its `npm/*` target sidecars).                                                                                                                                                                                                                                               |
| `plugin/`    | Kernel plugins, framework-free. Directory drops the `plugin-` prefix (the group says it); npm names keep it.                                                                                                                                                                                                                                                                            |
| `framework/` | ALL framework-specific code. Nothing framework-flavored exists outside this group — where "framework-flavored" means adapter code (hooks/components for composing viewers); see `viewer/`.                                                                                                                                                                                              |
| `viewer/`    | The full-viewer PRODUCT line: the one React chrome (`chrome`, private), its Preact-compiled delivery (`main` → `@embedpdf/viewer`: the `<embedpdf-viewer>` element + `EmbedPDF.init`), and thin per-framework wrappers (`react`, `vue`, `svelte`, `angular`). Products BUILT ON `framework/`, not adapters: a viewer package exports the finished viewer, never composition primitives. |

Examples (`examples/*`) and internal tooling (`tooling/*`) are not part of the
law's namespace: examples are `@embedpdf/example-<dir>` and private; tooling is
`@embedpdf/tooling-<dir>` and private.

## `cloudpdf/` — the same law, the other scope

`cloudpdf/` holds the CloudPDF (`@cloudpdf/*`) tree, and the directory name IS
the scope. The three clauses apply verbatim with the scope swapped:
`cloudpdf/viewer/react` → `@cloudpdf/viewer-react`, and `cloudpdf/viewer/main`
is the group's namesake `@cloudpdf/viewer`. One law, two scopes — a CloudPDF
package is never named by a separate rule.

`cloudpdf/` is a SCOPE boundary, not a license boundary. The license line is
per-package and runs by what a package IS, not where it lives: libraries are
Apache-2.0 like the rest of the repo; the deployable server product
(`cloudpdf/server`) is Fair Source (FCL-1.0-ALv2), the repository's only
non-Apache package. See `LICENSING.md`. Do not infer a package's license from
its directory; read its own `LICENSE`.

What decides whether a path gets a group level is one line:

> **A directory level exists to hold siblings.**

That is why every `packages/` group is grouped (each has siblings) and why
`cloudpdf/engine`, `cloudpdf/server`, `cloudpdf/admin`, `cloudpdf/admin-api`
sit flat: a group level over a lone package carries no information.
`cloudpdf/viewer/` is grouped because the viewer product line has five members
(`main` plus one wrapper per framework). When a flat CloudPDF package gains a
sibling it regroups then — repo paths are internal, so unlike npm names a move
costs nothing but the churn.

Two consequences worth stating, because both have already caught us:

- **Nothing may reconstruct a package's directory from its npm name.** Clause 1
  maps path → name, and that is not invertible without knowing the group list.
  Ask the workspace instead (`pnpm ls -r --depth -1 --json` yields name + path);
  the release workflows do.
- **Cross-scope names collide on their last segment.** `@embedpdf/viewer-react`
  and `@cloudpdf/viewer-react` are the two doors of one product — deliberately
  parallel — so anything keyed on the short name (release assets, cache keys,
  directories) must carry the scope.

Viewer wrappers keep the `viewer-` prefix in BOTH scopes; clause 3's bare
naming is for `framework/` adapters only. `@cloudpdf/react` is free on npm but
would read as the cloud twin of `@embedpdf/react` — a composition adapter —
when it is in fact a finished viewer.

## Corollaries

- Adding a package = choosing its group; the name falls out. A package that
  fits no group is a design conversation, not a naming one.
- Renames after 3.0.0 ships are breaking changes; before that they are free.
  This law was locked while everything was at 0.0.0 — keep it locked.
- The changeset `fixed` group in `.changeset/config.json` enumerates every
  `@embedpdf/*` publishable — one version for the whole SDK, engine included.
