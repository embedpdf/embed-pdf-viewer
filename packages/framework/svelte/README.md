# @embedpdf/svelte

The Svelte 5 adapter for EmbedPDF: components that take snippets, and functions that give you
reactive state for your runes. One entry point per feature, with the same names as
`@embedpdf/react`:

```ts
import { DocumentGate, Viewer } from '@embedpdf/svelte/runtime';
import {
  Stage,
  stagePlugin,
  useStage,
  useStageState,
} from '@embedpdf/svelte/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
```

The behavior is React's (`packages/framework/react`); the plugins' contracts are the API. This
file explains how the adapter works and how to add a plugin's binding to it.

## How it works

### One signal for the kernel

`<Viewer>` creates the kernel in the browser when it mounts, and puts a `KernelBinding` in
context (`src/runtime/binding.svelte.ts`). The binding turns the kernel's one change stream into
one Svelte signal: a version that moves on every change. Every reader reads that version inside a
`$derived`, computes its value again after a change, and passes it on only when it differs. The
binding subscribes for the kernel's whole life, so a reader gives the current value in a template,
an effect, a `$derived` or an event handler alike.

### Two shapes of reader

- **A record of named values** (a plugin's state, its settings, the document, scroll metrics) is a
  reactive object whose fields are getters: `state.zoomLevel`. Each field is its own `$derived`,
  so a template or an effect that reads `zoomLevel` runs again only when `zoomLevel` changes.
  Destructuring (`const { zoomLevel } = state`) reads once, like any Svelte reactive object.
- **One value** is `{ current }`, like Svelte's `MediaQuery`: `pages.current`. A state or settings
  reader called with a selector is one too: `useStageState((state) => state.zoomLevel).current`.

### Capability handles

`use<Plugin>()` (`useStage()`, `useDocuments()`) returns a handle (`src/runtime/capability-handle.ts`)
that is always the capability of the document in scope: a component calls it once, and the handle
resolves the capability again on every call, so a new active document or a changed
`<DocumentScope id>` needs nothing from you. Without a ready document a document plugin's calls
reach its stand-in (`standInFor` from `@embedpdf/core`) and refuse with
`PluginError('not-ready')`: a method that returns a promise (`form.setValue`, `redaction.markPage`)
returns a rejected promise, so `.catch()` sees it, and every other method throws. Its settings
calls still work.

**The read rule, the same in every adapter:** a method named `get*`, `list*`, `is*`, `has*` or
`can*` (the capability vocabulary's reads, see `docs/conventions/naming.md`) is a read: called in
a template, a `$derived` or an `$effect`, it updates when its answer changes:
`disabled={!stage.canGoNext()}`. Every other method (a verb, an event) tracks nothing, so an effect
that calls `thumbs.reveal(state.currentPageIndex)` runs again only when the index changes. A
synchronous read outside that vocabulary (`redaction.estimateCollateral()`) doesn't update a
template by itself.

### Contexts

| Context                            | Provided by                       | Read by                                             |
| ---------------------------------- | --------------------------------- | --------------------------------------------------- |
| The kernel binding                 | `<Viewer>`                        | every reader (`useKernelBinding()`)                 |
| The document scope                 | `<DocumentScope id>`              | every reader (`documentScopeOf()`)                  |
| The stage lens                     | `<Stage>`, `<StageScope token>`   | the stage readers, `<Scrollbar>` (`stageTokenOf()`) |
| The page                           | each `<Stage>` page, `<PageView>` | layers (`usePage()`)                                |
| The projection and the pages shown | `<Stage>`, `<PageView>`           | `<Anchored>` (`src/anchored/context.ts`)            |

Contexts hold functions or live objects, never plain values, so a prop that changes (`id`,
`token`) reaches the readers. `usePage()` gives an object that reads the current page context on
every access: `page.transform` in a template follows the zoom.

## Adding a plugin binding

Take the search plugin as the example. Everything below lives in this package.

### 1. The entry point

`src/search.ts` re-exports the plugin (registration travels with the UI), then the components and
readers:

```ts
/** @embedpdf/svelte/search — … */
export * from '@embedpdf/plugin-search';

export { default as SearchLayer } from './search/SearchLayer.svelte';
export type { SearchLayerProps } from './search/props';
export {
  useSearch,
  useSearchEvent,
  useSearchHits,
  useSearchSettings,
  useSearchState,
} from './search/readers.svelte';
```

Add it to `package.json` twice, in the same shape as the others: `exports["./search"]` with
`types`, `svelte` and `default` pointing at `./src/search.ts`, and `publishConfig.exports["./search"]`
pointing at `./dist/search.d.ts` / `./dist/search.js`. Add `export * from './search'` to
`src/index.ts`. Files with runes end in `.svelte.ts`; the entry itself only re-exports, so it's
plain `.ts`.

### 2. The readers (`src/search/readers.svelte.ts`)

```ts
import type { EventHook, PageRef } from '@embedpdf/core';
import { SearchToken, searchState } from '@embedpdf/plugin-search';
import type { SearchCapability, SearchHit } from '@embedpdf/plugin-search';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalSelector,
} from '../runtime/readers.svelte';
import { settingsReader, stateReader } from '../runtime/state.svelte';
import {
  valueOf,
  type CurrentValue,
  type MaybeGetter,
} from '../runtime/values.svelte';

/** The API: a handle, always the capability of the document in scope. */
export function useSearch(): SearchCapability {
  return useCapability(SearchToken);
}

/** The state: one line, from the plugin's `defineState` declaration. */
export const useSearchState = stateReader(searchState);

/** The settings: one line, from the token. */
export const useSearchSettings = settingsReader(SearchToken);

/** Events, cleaned up when the component goes away, subscribed again when the document changes. */
export function useSearchEvent<T>(
  select: (search: SearchCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(SearchToken, select, handler);
}

const NO_HITS: readonly SearchHit[] = Object.freeze([]);

/** One value is `{ current }`. An argument that changes is a function (`() => page`). */
export function useSearchHits(
  page?: MaybeGetter<PageRef | number | undefined>,
): CurrentValue<readonly SearchHit[]> {
  return useOptionalSelector(
    SearchToken,
    (search) => {
      const only = valueOf(page);
      return search.listHits(only === undefined ? undefined : { page: only });
    },
    NO_HITS,
  );
}
```

- Use `useOptionalSelector` (a fallback without a document) for chrome that renders before a
  document opens; `useSelector` throws the kernel's reason instead, like React's.
- A selector that builds a fresh object or array each time passes an `isEqual`
  (`shallowEqual`, `shallowArray`), so readers wake only when something changed.
- A plugin without a state declaration builds the record itself: `declaredState(binding, token,
read, empty)` and `readRecord(whole, keys)` from `../runtime/state.svelte` (see
  `useStageSettings` in `src/stage/readers.svelte.ts`).
- Readers are called while a component is created, like every `use…()` function.

### 3. A component (`src/search/SearchLayer.svelte`, `src/search/props.ts`)

The props interface goes in a `.ts` file, so the entry can export it. Map React's props this way:

| React                             | Svelte                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onHitClick`                      | `onHitClick`, a callback prop (`onHitClick?.(hit)`)                                                                                                                         |
| `renderLink={(link) => …}`        | a snippet named without `render`: `link?: Snippet<[link: LinkInfo]>`, `{@render link?.(info)}`                                                                              |
| `children`                        | `children?: Snippet`                                                                                                                                                        |
| a page function (`{(page) => …}`) | `children: Snippet<[page: PageContextValue]>`, rendered per page: the content between the tags, or `{#snippet children(page)}` when it needs the page (`<Stage>` does this) |
| `zoom` + `onZoomChange`           | `zoom = $bindable()`, for `bind:zoom`                                                                                                                                       |
| `className`, `style={{ … }}`      | `class`, `style` (a string), appended after the component's own                                                                                                             |

Snippet arguments stay live: pass the current value, and the snippet updates with it. A
component whose content is a per-page template takes it as `children`, not as a snippet named
`page`: in Svelte snippets and props share one namespace, and `page` is the two-way current page
(`bind:page`), as on Vue (`v-model:page`) and Angular (`[(page)]`). Content written straight
between the tags is a `children` snippet with no parameter; it can still be rendered with the
page as its argument.

### 4. A layer on each page

A layer reads the page it draws on with `usePage()`, and the plugin through an optional reader
(nothing without a document, so the layer just draws nothing). A plugin with a host lens
(`@embedpdf/plugin-x/contract/host`) is read with that token, as `<RenderLayer>` does:

```svelte
<script lang="ts">
  import { SearchToken } from '@embedpdf/plugin-search';
  import { usePage } from '../runtime/page';
  import { useOptionalSelector } from '../runtime/readers.svelte';

  const page = usePage();
  const hits = useOptionalSelector(
    SearchToken,
    (search) => search.listHits({ page: page.ref }),
    [],
  );
</script>

{#each hits.current as hit (hit.start)}
  {#each hit.segments as segment, index (index)}
    {@const box = page.transform.pageToViewRect(segment.rect)}
    <div
      style:position="absolute"
      style:left="{box.x}px"
      style:top="{box.y}px"
      style:width="{box.width}px"
      style:height="{box.height}px"
    ></div>
  {/each}
{/each}
```

- Positions come from `page.transform`; never multiply by the zoom or the pixel ratio.
- DOM work (listeners, observers, `bindPaintedImage`) goes in a `$effect` that returns its cleanup.
  Read what should re-run the effect at its top, and do the work in `untrack`.
- A handler that must stop an event before the Stage sees it is a native listener, in an effect:
  Svelte 5 delegates `onpointerdown`, `onclick`, `onpointermove` and the other bubbling events to
  the root, so a `stopPropagation()` there runs after the Stage's own listener. For a press, use
  `isolatePointerDown(element, onPress)` from `@embedpdf/web` (as `<Anchored>` does); for the
  wheel, `isolateWheel`.
- A layer that paints a part of the page itself (the annotations, the form fields) says so with
  `usePaintsPagePart` (`src/runtime/page-layers.svelte.ts`), and `<RenderLayer>` leaves that part
  out of the page's picture.
- Shared, framework-free browser code belongs in `@embedpdf/web`; if what you need isn't there,
  write it small, here, and say so (it's a candidate to move).

### 5. Tests (`test/<feature>/*.test.ts`)

Port React's binding tests (not the plugin's). The fixtures in `test/fixtures/`:

- `viewerWith(plugins, Component, props, engine?)` mounts a `<Viewer>` around a component and
  returns its kernel once mounted; `counter-plugin.ts` has a document plugin, a fake engine that
  opens any document at once (`pagedEngine(n)` for `n` pages), and `bytesInput(id)`.
- `Probes.svelte` takes `{ read, pick, seen, scope? }` entries: it calls `read()` while created
  and pushes `pick(result)` on every change, so `seen.length` counts updates the way React's
  tests count renders.
- After a kernel call, `flushSync()` from `svelte` runs the effects before you assert.

```ts
it('wakes only when the hit count changes', async () => {
  const count = {
    read: () => useSearchState(),
    pick: (state) => state.hitCount,
    seen: [],
  };
  const { kernel } = await viewerWith([searchPlugin()], Probes, {
    probes: [count],
  });
  await kernel.documents.open(bytesInput('a'));
  flushSync();
  expect(latest(count.seen)).toBe(0);
});
```

A component that needs snippets gets a small harness component in `test/fixtures/`, written in
Svelte (see `StageHarness.svelte`, `GateHarness.svelte`).

The tests compile with `svelte/compiler` through `test/helpers/svelte-compile.ts`: Vitest here runs
on Vite 5, and `@sveltejs/vite-plugin-svelte` needs Vite 6.

### 6. Checks

```sh
pnpm --filter @embedpdf/svelte test
pnpm --filter @embedpdf/svelte typecheck      # svelte-check over src and test
pnpm --filter @embedpdf/svelte build          # svelte-package into dist, then the publish check
pnpm --filter @embedpdf/docs-content snippets
pnpm --filter @embedpdf/docs-content samples <area>
```

Nothing in the workspace reads `dist`, so the build ends by proving it.
`tooling/build/src/fully-specify-imports.mjs` gives every relative import in `dist` its file
(`./readers.svelte.js`, which Node, webpack and TypeScript's `node16` need; svelte-package keeps
the source's extensionless imports). `tooling/build/src/check-framework-package.mjs` then packs
the package, runs publint and attw on the tarball, and type-checks the app in `consumer/` against
it with `svelte-check`: the lines in `consumer/Canary.svelte` marked `error expected` must fail,
and nothing else may. A failure there is what a user would get from npm.

## Good to know

- **A local named `state` turns off `$state`** in that component: Svelte reads `$state` as the
  store `state`. Name the reader's object something else (`stageState`) when the component also
  uses `$state`.
- **A changing `style={string}` rewrites the element's whole inline style**, dropping what code set
  on it (the rich-text editor's `line-height`). Use `style:` directives on elements that code also
  styles, or set the property again after each change, as `useRichTextEditor` does.
- **A read in an effect subscribes.** `$effect(() => remember(stage.getViewpoint()))` runs on every
  kernel change; for a one-off read use `onMount` or `untrack`.
- **The engine and the plugins are read once.** Put them in `<script module>` (or a module), like
  React's module scope; `<Viewer>` warns when they change.
- **A snippet can't draw "nothing, use the default".** A React render prop that returns
  `undefined` falls back to the default part; a snippet that is passed always draws. So a snippet
  that serves many parts draws all of them: the toolbar's `custom` draws every custom item (one it
  draws nothing for shows nothing, not its command), and the default (a native `<slot>` socket
  with the item's command inside) is for when no `custom` snippet is passed.
- **An argument that is an element is a function** (`useCommandShortcuts({ target: () => area })`
  with `bind:this={area}`): the element is set after the component is created, and the reader
  binds once it's there.
- **A part handed to a snippet is a snippet declared in the `{#each}`** (`<LinkLayer>`'s
  `native`, passed to its `link` snippet as `{ link, native }`): declared inside the block, it
  closes over the item, and the app draws it with `{@render native()}`.
- **A layer that only listens doesn't need native listeners.** `<SearchLayer>`'s
  `onpointerdown`/`onclick` stop nothing, so Svelte's delegation is fine there; only a press that
  must not reach the Stage (a link, a selection handle) goes through `isolatePointerDown` or
  `attachSelectionHandle`.
