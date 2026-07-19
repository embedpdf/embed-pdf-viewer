# Framework adapters — one import line per feature

How the framework packages (`@embedpdf/react`, and eventually `/vue`, `/svelte`,
`/angular`) expose the v3 stack to applications. `PLUGINS.md` is the law for
plugin authors; this file is the law for adapter authors — and the spec every
new framework package mimics.

## The principle

**A feature = a plugin package + one adapter subpath. The subpath re-exports
the plugin.** Registration, components, hooks, tokens, and types for a feature
all come from one import line — and deleting that line deletes the feature
from the app's bundle:

```tsx
import { Viewer } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import {
  AnnotationLayer,
  AnnotationMenu,
  annotationPlugin,
} from '@embedpdf/react/annotation';

const plugins = [
  stagePlugin(),
  renderPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];
```

An app depends on **two packages**: the adapter and an engine. The engine stays
a separate, explicit dependency on purpose — it is the heavy artifact, and
choosing local-wasm vs cloud is a real decision. Everything else (plugin
packages, ui-core, kernel) arrives transitively through the adapter,
version-locked, so plugin/adapter skew is impossible.

v2 shipped framework entries inside each plugin package. That multiplies by
frameworks and cannot work for Angular at all (an Angular library must be
built as one unit by ng-packagr). v3 inverts it: the adapter package owns ALL
framework code; plugin packages stay framework-free.

## The five rules

1. **One line per feature.** Every adapter subpath re-exports its plugin's
   public surface (`fooPlugin`, `FooToken`, public types) alongside its
   components and hooks. Apps never NEED to import `@embedpdf/plugin-*`
   directly; those packages remain available for headless and advanced use,
   but no app-facing doc requires them.
2. **Subpaths are the taught path; the root barrel is the opt-in
   "everything".** `@embedpdf/react` (the barrel) keeps working and is fine
   for prototyping — `sideEffects: false` lets production builds tree-shake
   it. But examples, docs, and quickstarts import subpaths exclusively:
   subpaths make the bundle guarantee legible instead of trusting the bundler.
3. **Trunk and branches.** `runtime` (the kernel binding) and `stage` (the
   viewport) are the trunk every app mounts. Feature subpaths may import the
   trunk, never each other. Documented exceptions exist only where the DOMAIN
   couples: `form → annotation` (widgets ARE annotations) and
   `annotation-menu → stage` (the one declared bridge file; its header says so).
4. **Features talk through capability tokens at runtime, never through
   imports.** `ctx.tryGet(Token)` is the kernel's law; it holds at the adapter
   layer too. If a feature file needs another feature's import, the design is
   wrong — reach through a token or move the code down into a plugin.
5. **Framework parity by spec.** The vertical table below and its export names
   ARE the spec. Vue/Svelte: same subpath `exports` map. Angular: each
   vertical becomes a secondary entry point (`@embedpdf/angular/annotation`)
   — Angular's native library modularity. The pure logic (ui-core projections,
   kernel derivations, plugin capabilities) is framework-free by rule, so each
   adapter binding is thin (~10-line painter loops, one reactive read
   primitive).

## The verticals

| Subpath            | Re-exports plugin     | Plus (adapter-owned)                          |
| ------------------ | --------------------- | --------------------------------------------- |
| `/runtime` (trunk) | `@embedpdf/core`      | `Viewer`, `DocumentGate`, reactive read hooks |
| `/stage` (trunk)   | `plugin-stage`        | `Stage` + camera-bound layers plumbing        |
| `/page-view`       | —                     | Stage-free single-page view                   |
| `/render`          | `plugin-render`       | `RenderLayer`                                 |
| `/interaction`     | `plugin-interaction`  | pointer/cursor binding hooks                  |
| `/selection`       | `plugin-selection`    | `SelectionLayer`, `useSelection`              |
| `/annotation`      | `plugin-annotation`   | `AnnotationLayer`, annotation hooks           |
| `/annotation-menu` | —                     | `AnnotationMenu` (the stage bridge)           |
| `/form`            | `plugin-form`         | `FormLayer`, form hooks                       |
| `/search`          | `plugin-search`       | `SearchLayer`, search hooks                   |
| `/metadata`        | `plugin-metadata`     | metadata hooks                                |
| `/page-edit`       | `plugin-page-edit`    | page-edit hooks                               |
| `/views`           | `plugin-view-manager` | view-manager hooks                            |
| `/i18n`            | `plugin-i18n`         | `useT`, `useLocale`                           |
| `/commands`        | `plugin-commands`     | `useCommand(s)`, `useCommandShortcuts`        |
| `/shell`           | `plugin-shell`        | `useSurface`, `useMenus`                      |
| `/toolbar`         | `@embedpdf/core-ui`   | `Toolbar`, `useStripView`, view contracts     |

`/toolbar` re-exports ui-core's authoring vocabulary (`defineChrome`, `group`,
`item`, `custom`, schema types) so an app's chrome config needs no direct
ui-core dependency.

## What a subpath file looks like

The re-export sits at the top of the feature file, below the header comment:

```ts
// One-line-per-feature (ADAPTERS.md): registration travels with the UI.
export * from '@embedpdf/plugin-selection';
```

The plugin package's `index.ts` is already the curated public surface (that's
PLUGINS.md's job), so a star re-export stays curated for free. If a star
collision ever appears at the barrel, resolve it by making the narrower export
explicit — never by renaming the plugin's surface.

## Adding a framework

1. One package: `@embedpdf/<framework>`. It owns every line of
   framework-specific code; plugin packages gain none.
2. Copy the `exports` map shape (dev: `./src/*.ts(x)`, publish: per-file
   `./dist/*`). Angular: secondary entry points instead, same names.
3. Implement the trunk first: the reactive read primitive over the kernel's
   one change stream (`useKernelValue` in React — a computed in Vue, a store in
   Svelte, a signal in Angular), then `Viewer`/`Stage`.
4. Bind verticals as products need them, in the table's order. Every vertical
   re-exports its plugin surface (rule 1) and keeps the import graph a tree
   (rule 3).
