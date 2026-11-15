# Framework adapters

`@embedpdf/react`, `@embedpdf/vue`, `@embedpdf/svelte` and `@embedpdf/angular`
(`packages/framework/`) give an app's UI the kernel and the plugins in its own
framework's terms: hooks, composables, runes, services. This file is the law
for how an adapter is built, and how a plugin's binding is added to one.
[`plugins.md`](./plugins.md) is the law for the plugin a binding is for.

An adapter's `README.md` is for the people who install the package, and is
written from the docs ([`docs-architecture.md`](./docs-architecture.md),
"Package READMEs"). What someone who works on an adapter needs is here.

## What decides a binding

1. **The plugin's contract is the API.** An adapter adds no method to a
   capability and renames none.
2. **React's binding is the reference for behavior**:
   `packages/framework/react/src/<plugin>.tsx`. The other three do what it
   does.
3. **The docs are the spec for the names.** A page is written with React's
   names, `docs/kit/mdx/frameworks.mjs` gives each framework's name for them,
   and the page's snippets (`docs/content/snippets/<area>/<name>.<framework>.*`)
   show them in use.

What each entry exports is in its API snapshot (`api/embedpdf__vue/stage.api.txt`),
which `pnpm api:check` keeps current. This file lists rules, not names.

## What is the same in every adapter

### One viewer owns the kernel

`<Viewer>` (on Angular, the `EpdfKernelHost` that `provideEmbedPdf()` provides)
creates the kernel in the browser when it mounts, never on the server, starts
it, and destroys it when it goes away. The engine and the plugins are read
once.

### One change stream, read through the framework

The kernel has one change stream. Each adapter turns it into what its framework
updates from, and every value it shows is read again after a change and passed
on only when it differs, so a template updates only when what it shows did.

| Adapter | The stream becomes                                                 | A reader is                                       |
| :------ | :----------------------------------------------------------------- | :------------------------------------------------ |
| React   | `useSyncExternalStore` over `kernel.subscribe`                     | `useKernelValue(select, isEqual)`                 |
| Vue     | `track()`, which makes a computed depend on the stream             | `useKernelValue(select, isEqual)`, a computed     |
| Svelte  | one signal, a version that moves on every change (`KernelBinding`) | a `$derived` that reads the version               |
| Angular | a signal write per change (`revision` on the host)                 | a `computed()`: `host.read()`, `binding.select()` |

### A plugin's API follows the document in scope

`useSearch()` (`inject(EpdfSearch)` on Angular) gives the capability of the
document in scope: the nearest document scope's, else the active one.

- **React** resolves it while rendering, as a read of the kernel
  (`useCapability` in `src/runtime.tsx`), so a component renders again when the
  capability it resolves to changes.
- **Vue, Svelte and Angular** create a component once, so there the API is a
  live handle: it is called once and kept, and its members are looked up when
  they are used, on the capability of the document in scope then. A new active
  document or a changed document scope needs nothing from the component. The
  handle never changes, so it is safe in closures and handlers. Never
  destructure it (`const { update } = useMetadata()`): keep it, and call
  through it.

Without a ready document, a document plugin's API reaches its stand-in
(`standInFor`, `packages/core/main/src/capability-handle.ts`):

- reading a member never throws, so a component that holds the API renders;
- calling one refuses with `PluginError('not-ready')`, a read too: a method
  that returns a promise (`form.setValue`, `redaction.markPage`) returns a
  rejected one, so `.catch()` sees it, and every other method throws. Which
  methods return a promise comes from the plugin's token (`promises`);
- the settings calls work, for a plugin that declares settings.

A token no plugin provides still throws the kernel's reason: that is a setup
mistake, not a missing document.

### The read rule

In Vue, Svelte and Angular, a method named `get*`, `list*`, `is*`, `has*` or
`can*` is a read (`isReadMember` in `packages/core/main/src/capability-handle.ts`;
the capability vocabulary of [`naming.md`](./naming.md)). Called in a template
or in the framework's derived value or effect, it updates when its answer
changes: `v-if="annotation.canCreate()"`, `disabled={!stage.canGoNext()}`,
`[disabled]="!metadata.canUpdate()"`.

Every other method tracks nothing, so an effect that calls
`stage.reveal(index)` runs again only when `index` changes. A synchronous read
outside the vocabulary (`redaction.estimateCollateral()`) doesn't update a
template by itself.

React has no such rule: a component reads while it renders, and renders again
when a value one of its hooks gives changes.

### State, values, arguments and events

| What                     | React                             | Vue                  | Svelte                              | Angular                                    |
| :----------------------- | :-------------------------------- | :------------------- | :---------------------------------- | :----------------------------------------- |
| A plugin's state         | `useSearchState()`, an object     | one ref per field    | one object whose fields are getters | a signal per field on the service          |
| State with a selector    | the value                         | one ref              | `{ current }`                       | a `computed()` of your own                 |
| One value                | the value (`useSearchHits()`)     | a ref                | `{ current }`                       | a signal, or a method that returns one     |
| An argument that changes | the hook runs again               | a `MaybeRefOrGetter` | a function (`() => page`)           | a value or a function                      |
| Events                   | `useSearchEvent(select, handler)` | the same             | the same                            | RxJS streams on the service (`completed$`) |

- **State and settings are one line each**, from the plugin's `defineState`
  declaration and its token: `stateHook` / `settingsHook` (React),
  `stateComposable` / `settingsComposable` (Vue), `stateReader` /
  `settingsReader` (Svelte), the `state` option of `pluginService()` (Angular).
  They read empty without a document, so they render anywhere.
- **Destructuring** keeps Vue's refs reactive (`const { zoomLevel } =
useStageState()`), and reads a Svelte object once, like any Svelte reactive
  object.
- **Events end with the component**: subscribed to the document in scope,
  again when that document changes, stopped when the component goes away.

### The page context is the seam

A page surface (each page of a `<Stage>`, a `<PageView>`) provides the page,
and a layer reads it: `usePage()`, `injectPage()` on Angular. It changes when
the page's geometry does (a zoom, a turn), never on a pan. A layer places
things with the page's transform (`pageToViewRect`), and never multiplies by
the zoom or the pixel ratio.

A layer that paints a part of the page itself (the annotations, the form
fields) says so (`usePaintsPagePart`, `paintsPagePart()` on Angular), and the
render layer leaves that part out of the page's picture.

Two scopes choose what a subtree talks to. The document scope is
`<DocumentScope>`, `[epdfDocumentScope]` on Angular. The stage lens is `<Stage>`
for its own pages and overlay, and `<StageScope>` elsewhere in React, Vue and
Svelte; on Angular, `inject(EpdfStageRef)` is the Stage it is inside, and
anywhere else the main view of the document in scope.

### Browser code that isn't a framework's is `@embedpdf/web`

The Stage's gestures, painted images, the anchored placement math, cursors and
the theme variables come from `@embedpdf/web`, shared by all four. So does what
every page surface computes: the page context (`makePageContext`), the
surface's boxes (`pageSurfaceLayout`), the projectors, the page's pointer
listener (`attachPagePointer`) and the scrollbar (`scrollbarLayout`,
`createScrollbarPresses`).

When logic every adapter needs is missing there, write the small piece you need
next to your feature and say it is a candidate to move, rather than editing a
shared package for one adapter.

### A feature is one entry, and it brings its plugin

Each feature is one import path (`@embedpdf/vue/search`), so a bundle carries
only the features it imports. The entry re-exports the plugin
(`export * from '@embedpdf/plugin-search'`), so registering a plugin and
importing its components come from the same place. See "Package entries and
bundle boundaries" in [`plugins.md`](./plugins.md).

### React's props in each framework

| React                             | Vue                                          | Svelte                                             | Angular                                           |
| :-------------------------------- | :------------------------------------------- | :------------------------------------------------- | :------------------------------------------------ |
| a value prop (`tiles`)            | a prop (`:tiles`)                            | a prop                                             | an `input()` (`[tiles]`)                          |
| `onHitClick`                      | an event (`@hit-click`)                      | `onHitClick`, a callback prop                      | an `output()` named `hitClick`                    |
| `zoom` + `onZoomChange`           | a model (`v-model:zoom`)                     | `zoom = $bindable()` (`bind:zoom`)                 | an input and an output, for `[(zoom)]`            |
| `renderLink={(link) => …}`        | a scoped slot (`#link="{ link }"`)           | a snippet named without `render` (`link`)          | a marker directive on an `<ng-template epdfLink>` |
| a page function (`{(page) => …}`) | the `#page` slot                             | `children`, a snippet that gets the page           | `<ng-template epdfPage let-page>`                 |
| `className`, `style={{ … }}`      | `class` and `style` fall through to the root | `class`, `style` (a string), after the component's | the host element's own                            |
| a part handed over (`native`)     | drawn with `<component :is>`                 | a snippet, drawn with `{@render native()}`         | a template in the context (`let-native="native"`) |

**A slot, a snippet and a template can't draw "nothing, use the default".** A
React render prop that returns `undefined` falls back to the default part; one
that is given always draws. So one that serves many parts draws all of them.
The toolbar's custom items show how each framework settles it:

- **Vue:** `#custom` draws every custom item, and one it draws nothing for
  shows its command's button.
- **Svelte:** the `custom` snippet draws every custom item, and one it draws
  nothing for shows nothing, not its command.
- **Angular:** the items are templates by name
  (`epdfToolbarCustom="page-number"`), and an item with no template of its name
  is the default.

The default, when nothing is given for an item, is a native `<slot>` socket
with the item's command inside.

### Tests and checks

Port React's tests of the binding, not the plugin's: empty state without a
document, values that change only when their value does, the document scope,
events that follow the document and stop with the component, and the
component's slots, models or outputs.

```sh
pnpm --filter @embedpdf/<framework> test
pnpm --filter @embedpdf/<framework> typecheck
pnpm --filter @embedpdf/<framework> build
pnpm --filter @embedpdf/docs-content snippets         # your pages compile, per framework
pnpm --filter @embedpdf/docs-content samples <area>   # your examples compile
```

Nothing in the workspace reads an adapter's `dist`, so each build ends by
proving it as an app would read it: "Vue and Svelte: finishing and proving
`dist`" in [`tooling/build/README.md`](../../tooling/build/README.md), and
`scripts/check-declarations.mjs` for Angular, below.

## React

React is the reference, so it has no mapping to follow.

- A feature is `src/<plugin>.tsx` (or `.ts` without components).
- `src/runtime.tsx` binds the kernel: `useKernelValue`, `useCapability`,
  `useSelector`, `useOptionalSelector` (a fallback without a document) and
  `useCapabilityEvent`.
- `src/state.ts` has `stateHook` and `settingsHook`. A state hook returns the
  whole state, or the value its selector picks, and re-renders only when that
  changes (compared with `shallowEqual`).

## Vue

### How the package is written

**Components are single-file components (`.vue`), composables are plain
TypeScript.** A component here is mostly a template with slots and `v-model`,
which is what a Vue developer reads and writes every day. `defineProps`,
`defineEmits`, `defineSlots` and `defineModel` give typed props, events and
scoped slots to the app's templates through `vue-tsc`. Render functions in
`defineComponent` would hide that template behind `h()` calls. The cost is a
build step that understands `.vue`, which every Vue app has.

Each feature is an entry file and a folder: `src/stage.ts` is
`@embedpdf/vue/stage`, and its components and composables live in `src/stage/`.

In the workspace, `exports` points at the source, so tests, the docs' checks
and the demos read it directly. `publishConfig.exports` points the published
package at `dist` (`import` and `require`, each with its declarations). The
build reads its entries from `exports`, and `test/package-exports.test.ts`
checks the two lists agree.

| Script      | What it does                                                              |
| :---------- | :------------------------------------------------------------------------ |
| `test`      | Vitest in happy-dom, with `@vue/test-utils`                               |
| `typecheck` | `vue-tsc` over `src` and `test`, with `strictTemplates`                   |
| `build`     | Vite library build into `dist`, `vue-tsc` declarations, the publish check |

### Adding a plugin binding

`search` is the example.

1. **The entry.** Create `src/search.ts`, and add both lines to `package.json`:
   `"./search": "./src/search.ts"` in `exports`, and the `dist` pair in
   `publishConfig.exports` (`test/package-exports.test.ts` fails until both
   exist). Start the entry with what it is for, then re-export the plugin.
2. **The API, the state, the settings and the events:**

   ```ts
   export function useSearch(): SearchCapability {
     return useCapability(SearchToken);
   }
   export const useSearchState = stateComposable(searchState);
   export const useSearchSettings = settingsComposable(SearchToken);
   export function useSearchEvent<Event>(
     select: (search: SearchCapability) => EventHook<Event>,
     handler: (event: Event) => void,
   ): void {
     useCapabilityEvent(SearchToken, select, handler);
   }
   ```

3. **A one-value reader is a ref**, built on `useOptionalSelector` (a
   `fallback` without a document) or `useKernelValue`. A reader with an
   argument takes a `MaybeRefOrGetter` and reads it with `toValue()` inside the
   select, so it follows the argument:

   ```ts
   export function useSearchHits(): Readonly<Ref<readonly SearchHit[]>> {
     return useOptionalSelector(
       SearchToken,
       (search) => search.listHits(),
       NO_HITS,
     );
   }
   export function useAnnotationAnchor(
     annotation: MaybeRefOrGetter<AnnotationRef | null>,
   ) {
     return useOptionalSelector(
       AnnotationToken,
       (api) => anchorOf(api, toValue(annotation)),
       null,
     );
   }
   ```

4. **A component** is an SFC in `src/search/`, exported from the entry
   (`export { default as SearchLayer } from './search/SearchLayer.vue'`).
   - An event is `defineEmits<{ hitClick: [hit: SearchHit] }>()`. When the
     component must know whether anyone listens, as `<SearchLayer>` does to let
     matches take the pointer only then, declare an optional function prop
     `onHitClick` instead: `@hit-click` still works and is typed.
   - A controlled value is `defineModel('page')`, or a `page` prop with an
     `update:page` event when the component must tell its own changes from
     yours, as `<Stage>` does.
   - A scoped slot is declared with `defineSlots`.
   - Write the TSDoc on each prop, event and slot: it is what the app sees in
     its editor. A component with several roots has no root for `class` and
     `style` to fall through to.
5. **A layer drawn on each page** reads `usePage()`. Read `page.value` inside a
   computed or a selector, never once at setup, so it follows the page's
   geometry. Vue doesn't add `px` to numbers in `:style`. Work with the DOM in
   a `watch` with `flush: 'post'`, and clean up with `onCleanup`.
   `usePaintsPagePart` is in `src/page-layers.ts`. `RenderLayer.vue` is the
   example to copy.
6. **UI that floats over a page** goes in the Stage's `#overlay` slot and
   positions with `<Anchored :anchor>`; a component of yours that needs the
   projection reads `useProjectorBinding()`. A page surface of your own
   provides its page with `providePage(computed(() => makePageContext(…)))`,
   its document with `provideDocumentScope` (`src/runtime/kernel.ts`), and its
   projection by wrapping what floats in `<AnchoredScope :binding :shown>`.
   `src/stage/PageSurface.vue` and `src/stage/Stage.vue` show all three.
7. **A test** in `test/search.test.ts`: mount through
   `viewerWith(plugins, () => h(Probe))` from `test/counter-plugin.ts`, where
   `probe(setup)` makes a component of a setup function; drive the kernel,
   `await settle()`, and assert on what rendered or what a ref holds.

### Good to know

- **A slot outlet can't pass a prop named `name` with `:name`**, which names
  the outlet: bind an object, `v-bind="{ name, variant }"`.
- **`useFilePickerProvider(provider?)` takes a provider or a ref, never a
  getter**, because the provider is itself a function.
- **`useSurface(id)` gives `isOpen` and `props` as refs**, so it is
  destructured.
- **`useRichTextEditor(annotation)` gives `ref` as a function ref**, for `:ref`.
- **Another entry that needs `useAnnotationState` or `useAnnotationSettings`**
  without the layer imports `src/annotation/state.ts`.
- **Each control of `<FormLayer>` builds its box with `useWidgetBox`**
  (`src/form/widget-box.ts`), a composable, so the toggle's box can be its
  control. The press is kept from the Stage with `isolatePointerDown`, and the
  widget's PDF events come from `bindWidgetEvents` on the same box.

## Svelte

### How it works

`<Viewer>` puts a `KernelBinding` in context (`src/runtime/binding.svelte.ts`).
The binding subscribes for the kernel's whole life, so a reader gives the
current value in a template, an effect, a `$derived` or an event handler alike.

A record of named values (a plugin's state, its settings, the document, scroll
metrics) is a reactive object whose fields are getters: `state.zoomLevel`. Each
field is its own `$derived`, so what reads `zoomLevel` runs again only when
`zoomLevel` changes. One value is `{ current }`, like Svelte's `MediaQuery`:
`pages.current`.

| Context                            | Provided by                       | Read by                                             |
| :--------------------------------- | :-------------------------------- | :-------------------------------------------------- |
| The kernel binding                 | `<Viewer>`                        | every reader (`useKernelBinding()`)                 |
| The document scope                 | `<DocumentScope id>`              | every reader (`documentScopeOf()`)                  |
| The stage lens                     | `<Stage>`, `<StageScope token>`   | the stage readers, `<Scrollbar>` (`stageTokenOf()`) |
| The page                           | each `<Stage>` page, `<PageView>` | layers (`usePage()`)                                |
| The projection and the pages shown | `<Stage>`, `<PageView>`           | `<Anchored>` (`src/anchored/context.ts`)            |

Contexts hold functions or live objects, never plain values, so a prop that
changes (`id`, `token`) reaches the readers. `usePage()` gives an object that
reads the current page context on every access: `page.transform` in a template
follows the zoom.

### Adding a plugin binding

`search` is the example.

1. **The entry point.** `src/search.ts` re-exports the plugin, then the
   components and readers. Add it to `package.json` twice, in the same shape as
   the others: `exports["./search"]` with `types`, `svelte` and `default`
   pointing at `./src/search.ts`, and `publishConfig.exports["./search"]`
   pointing at `./dist/search.d.ts` and `./dist/search.js`. Add
   `export * from './search'` to `src/index.ts`. Files with runes end in
   `.svelte.ts`; the entry only re-exports, so it's plain `.ts`.
2. **The readers** (`src/search/readers.svelte.ts`):

   ```ts
   export function useSearch(): SearchCapability {
     return useCapability(SearchToken);
   }
   export const useSearchState = stateReader(searchState);
   export const useSearchSettings = settingsReader(SearchToken);
   export function useSearchEvent<T>(
     select: (search: SearchCapability) => EventHook<T>,
     handler: (event: T) => void,
   ): void {
     useCapabilityEvent(SearchToken, select, handler);
   }

   /** One value is `{ current }`. An argument that changes is a function (`() => page`). */
   export function useSearchHits(
     page?: MaybeGetter<PageRef | number | undefined>,
   ): CurrentValue<readonly SearchHit[]> {
     return useOptionalSelector(
       SearchToken,
       (search) => {
         const only = valueOf(page);
         return search.listHits(
           only === undefined ? undefined : { page: only },
         );
       },
       NO_HITS,
     );
   }
   ```

   - Use `useOptionalSelector` for UI that renders before a document opens;
     `useSelector` throws the kernel's reason instead, like React's.
   - A selector that builds a fresh object or array each time passes an
     `isEqual` (`shallowEqual`, `shallowArray`), so readers wake only when
     something changed.
   - A plugin without a state declaration builds the record itself:
     `declaredState(binding, token, read, empty)` and `readRecord(whole, keys)`
     from `src/runtime/state.svelte.ts` (see `useStageSettings` in
     `src/stage/readers.svelte.ts`).
   - Readers are called while a component is created, like every `use…()`
     function.

3. **A component** (`src/search/SearchLayer.svelte`). Its props interface goes
   in a `.ts` file (`src/search/props.ts`), so the entry can export it. Snippet
   arguments stay live: pass the current value, and the snippet updates with
   it. A component whose content is a per-page template takes it as `children`,
   not as a snippet named `page`: snippets and props share one namespace, and
   `page` is the two-way current page (`bind:page`), as on Vue (`v-model:page`)
   and Angular (`[(page)]`). Content written straight between the tags is a
   `children` snippet with no parameter; it can still be rendered with the page
   as its argument.
4. **A layer on each page** reads `usePage()`, and the plugin through an
   optional reader, so it draws nothing without a document. A plugin with a
   host lens (`@embedpdf/plugin-x/contract/host`) is read with that token, as
   `<RenderLayer>` does.
   - DOM work (listeners, observers, `bindPaintedImage`) goes in a `$effect`
     that returns its cleanup. Read what should re-run the effect at its top,
     and do the work in `untrack`.
   - A handler that must stop an event before the Stage sees it is a native
     listener, in an effect. Svelte 5 delegates `onpointerdown`, `onclick`,
     `onpointermove` and the other bubbling events to the root, so a
     `stopPropagation()` there runs after the Stage's own listener. For a
     press, use `isolatePointerDown(element, onPress)` from `@embedpdf/web`, as
     `<Anchored>` does; for the wheel, `isolateWheel`. A layer that only
     listens (`<SearchLayer>`) stops nothing, so delegation is fine there.
   - `usePaintsPagePart` is in `src/runtime/page-layers.svelte.ts`.
5. **Tests** (`test/<feature>/*.test.ts`), with the fixtures in
   `test/fixtures/`:
   - `viewerWith(plugins, Component, props, engine?)` mounts a `<Viewer>`
     around a component and returns its kernel once mounted;
     `counter-plugin.ts` has a document plugin, a fake engine that opens any
     document at once (`pagedEngine(n)` for `n` pages), and `bytesInput(id)`.
   - `Probes.svelte` takes `{ read, pick, seen, scope? }` entries: it calls
     `read()` while created and pushes `pick(result)` on every change, so
     `seen.length` counts updates the way React's tests count renders.
   - After a kernel call, `flushSync()` from `svelte` runs the effects before
     you assert.
   - A component that needs snippets gets a small harness component, written
     in Svelte (`StageHarness.svelte`, `GateHarness.svelte`).
   - The tests compile with `svelte/compiler` through
     `test/helpers/svelte-compile.ts`.

### Good to know

- **A local named `state` turns off `$state`** in that component: Svelte reads
  `$state` as the store `state`. Name the reader's object something else
  (`stageState`) when the component also uses `$state`.
- **A changing `style={string}` rewrites the element's whole inline style**,
  dropping what code set on it (the rich-text editor's `line-height`). Use
  `style:` directives on elements that code also styles, or set the property
  again after each change, as `useRichTextEditor` does.
- **A read in an effect subscribes.** `$effect(() =>
remember(stage.getViewpoint()))` runs on every kernel change; for a one-off
  read use `onMount` or `untrack`.
- **The engine and the plugins go in `<script module>`** (or a module), like
  React's module scope; `<Viewer>` warns when they change.
- **An argument that is an element is a function**
  (`useCommandShortcuts({ target: () => area })` with `bind:this={area}`): the
  element is set after the component is created, and the reader binds once
  it's there.
- **A part handed to a snippet is a snippet declared in the `{#each}`**
  (`<LinkLayer>`'s `native`, passed to its `link` snippet as
  `{ link, native }`): declared inside the block, it closes over the item.

## Angular

### How it fits together

- **`provideEmbedPdf(config, ...features)`** returns providers. Each injector
  that gets them (a component, a route, the app) has one viewer:
  `EpdfKernelHost` creates the kernel in the browser once the engine is there
  (a factory may return a promise), starts it, opens `initialDocuments`, and
  destroys it with the injector.
- **Services.** A plugin's service (`inject(EpdfSearch)`) has the plugin's
  methods, its State table as signals, its events as RxJS streams
  (`completed$`), and its settings. `pluginService()` builds that from the
  plugin's declarations. A service acts on the document of the injector that
  created it: `[epdfDocumentScope]` (and a Stage with a `[document]`) provide
  every service again, bound to their document; elsewhere a service follows
  the active document.
- **Components** are standalone and `OnPush`, with signal inputs and outputs,
  and touch the DOM only in the browser
  (`isPlatformBrowser(inject(PLATFORM_ID))`). The Stage is its own API, reached
  from around it with `#stage="epdfStage"` or `viewChild(EpdfStage)`, and from
  inside it with `inject(EpdfStageRef)`, which anywhere else drives the main
  view of the document in scope.
- **Errors** a developer can make while setting up have a number and the fix:
  `EPDF-101` (no viewer), `EPDF-102` (a plugin's service without its feature),
  `EPDF-103` (page UI outside a page), `EPDF-104` (Stage UI outside a Stage),
  `EPDF-105` (an engine call on the server). They link to
  `/docs/headless/angular/errors`.

### Adding a plugin binding

`search` is the example.

1. **The entry point.** `search/ng-package.json` (copy
   `render/ng-package.json`), `search/src/public_api.ts`, a `./search` entry in
   `package.json`'s `exports` in the same shape as the others, and a line in
   `src/public_api.ts`. `scripts/check-parity.mjs`, part of `test`, fails on a
   React entry point this package neither has nor lists in its `PENDING`.
2. **The service and the feature:**

   ```ts
   @Injectable({ providedIn: 'root' })
   export class EpdfSearch extends pluginService({
     name: 'EpdfSearch', // as errors show it
     feature: 'withSearch()', // as errors show it
     token: SearchToken,
     state: searchState, // every field becomes a signal: search.hitCount()
     // Every method of the page's Methods table, its reads among them.
     methods: ['search', 'nextHit', 'previousHit', 'goToHit', 'listHits'],
     // Every event of its Events table: completed$, activeHitChanged$.
     events: ['onCompleted', 'onActiveHitChanged'],
   }) {
     /** A value with arguments is a method that returns a signal. */
     hitsOn(
       page: PageRef | number | (() => PageRef | number),
     ): Signal<readonly SearchHit[]> {
       const pageOf = typeof page === 'function' ? page : () => page;
       return this.binding.select(
         (search) => search.listHits({ page: pageOf() }),
         NO_HITS,
         Object.is,
       );
     }
   }

   export function withSearch(options?: SearchConfig): EmbedPdfFeature {
     return { plugins: [searchPlugin(options)], services: [EpdfSearch] };
   }
   ```

   - `settings()`, `getSettings()`, `updateSettings()`, `resetSettings()` and
     `settingsChanged$` come by themselves when the plugin declares settings,
     and work before any document opens. Don't list `getSettings` in `methods`.
   - `providedIn: 'root'` is only the fallback that turns a missing feature
     into EPDF-102; the feature's `services` provides it next to the viewer
     and under every document scope.
   - A namespace (`metadata.custom`, `annotation.selection`) is an object of
     its own on the service, built the same way
     (`this.binding.namespaceMethod('custom', 'update')`,
     `this.binding.select(…)`, `this.binding.stream(…)`; `metadata/src/metadata.ts`
     has one). A namespace is never itself a signal, and a State value never
     shares a name with the service or a namespace (`EpdfMetadata` has
     `fields()` and `custom.fields()`).
   - A helper that needs the caller's lifetime
     (`interaction.overrideCursor(() => spec)`) creates its `effect()` in the
     caller's injection context; say so in its doc comment.
   - App-wide setup that React does with a hook (`useCommandShortcuts()`) is a
     feature: `withCommandShortcuts()` returns
     `{ plugins: [], setup: () => { … } }`; `setup` runs once in the providers'
     injection context, after the viewer is created.

3. **A component.** An output the component must know is listened to, as
   `<epdf-search-layer>` does to let matches take the pointer only then, is
   `outputFromObservable()` over a `Subject`, whose `observed` says so.
4. **A layer drawn on each page** goes inside `<ng-template epdfPage>`, reads
   its page with `injectPage()`, and resolves its plugin for the page's own
   document:

   ```ts
   export class EpdfSearchLayer {
     private readonly page = injectPage('<epdf-search-layer>'); // EPDF-103 outside a page
     private readonly search = new CapabilityBinding<SearchCapability>(
       injectKernelHost('<epdf-search-layer>'),
       () => SearchToken,
       () => this.page.documentId,
     );
     private readonly hits = this.search.select(
       (search) => search.listHits({ page: this.page.ref }),
       NO_HITS,
       Object.is,
     );
   }
   ```

   `page.transform()`, `page.frame()` and `page.pageIndex()` are signals that
   move with the camera; the context itself never changes.

5. **Custom drawing with a template.** React's render prop becomes a marker
   directive on an `<ng-template>`, typed with a context guard, that the
   component reads with `contentChild()`:

   ```ts
   export interface EpdfLinkTemplateContext {
     $implicit: LinkInfo;
   }

   @Directive({ selector: 'ng-template[epdfLink]' })
   export class EpdfLinkTemplate {
     readonly template =
       inject<TemplateRef<EpdfLinkTemplateContext>>(TemplateRef);
     static ngTemplateContextGuard(
       _: EpdfLinkTemplate,
       context: unknown,
     ): context is EpdfLinkTemplateContext {
       return true;
     }
   }
   ```

   - A name that would clash gets a prefix: the toolbar's command template is
     `epdfToolbarCommand`, because `epdfCommand` is the directive on your own
     buttons.
   - Floating UI next to something on a page uses `<epdf-anchored [anchor]>`
     inside the Stage.
   - An entry a template inside `<ng-template epdfPage>` registers (an
     annotation renderer) is interned, so the same rule gives the same entry
     on every page and its behaviors register once: Angular creates that
     template once per page.
   - A marker directive's inputs are never `input.required`, because a
     template inside `@if` enters `contentChildren` before its inputs are set.

6. **A test.** Tests run in vitest with happy-dom, compiling components just
   in time with `TestBed`, zoneless (`vitest.config.mts` runs Angular's JIT
   transform on this package's files, so signal inputs and queries work).
   `test/fixtures.ts` has a fake engine, a small document plugin, and
   `viewerHost()`, `mount()` and `kernelOf()`. Port the setup errors' tests too.

### The build's last check

The build ends with `scripts/check-declarations.mjs`: it imports every entry
point from `dist` with `skipLibCheck: false` and fails on any error there. The
usual one is an import that doesn't resolve, which an app
(`skipLibCheck: true`) never reports: the service whose type needed it quietly
loses its members. It happens when a declaration needs a type its source file
doesn't import, and the compiler names it through another module: the entry
point's own public name, or the package that declares it, which may not be a
dependency of this one. Import that type into the file
(`runtime/src/services.ts` imports `PluginServiceClass`), or give the member an
explicit type.

What an Angular example in the docs must look like is in
[`docs-architecture.md`](./docs-architecture.md), "An example in each
framework".
