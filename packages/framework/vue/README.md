# @embedpdf/vue

The Vue 3 adapter for EmbedPDF: components for your templates and composables for
`<script setup>`. One import path per feature (`@embedpdf/vue/stage`, `@embedpdf/vue/render`), so
a feature you don't use never reaches your bundle.

```vue
<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: { kind: 'url', url: '/file.pdf' } }]">
    <DocumentGate>
      <template #fallback><p>Opening…</p></template>
      <Stage style="height: 600px">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
```

The documentation is at [embedpdf.com/docs/headless/vue](https://www.embedpdf.com/docs/headless/vue).

## How the package is written

**Components are single-file components (`.vue`), composables are plain TypeScript.** A component
here is mostly a template with slots and `v-model`, which is what a Vue developer reads and writes
every day; `defineProps`, `defineEmits`, `defineSlots` and `defineModel` give typed props, events
and scoped slots to the app's templates through `vue-tsc`. Render functions in `defineComponent`
would hide that template behind `h()` calls. The cost is a build step that understands `.vue`
(Vite with `@vitejs/plugin-vue`, and `vue-tsc` for the declarations), which every Vue app has.

Each feature is an entry file and a folder: `src/stage.ts` is `@embedpdf/vue/stage`, and its
components and composables live in `src/stage/`. The entry re-exports the plugin
(`export * from '@embedpdf/plugin-stage'`), so `stagePlugin()` comes from the same import as
`<Stage>`.

| Script                                  | What it does                                                                                                             |
| :-------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @embedpdf/vue test`      | Vitest in happy-dom, with `@vue/test-utils`                                                                              |
| `pnpm --filter @embedpdf/vue typecheck` | `vue-tsc` over `src` and `test`, with `strictTemplates`                                                                  |
| `pnpm --filter @embedpdf/vue build`     | Vite library build (ESM and CJS, one file per entry) into `dist`, `vue-tsc` declarations, then the publish check (below) |

In the workspace, `exports` points at the source, so tests, the docs' checks and the demos read
it directly. `publishConfig.exports` points the published package at `dist` (`import` and
`require`, each with its declarations next to it, as in the React package). The build reads its
entries from `exports`, and `test/package-exports.test.ts` checks the two lists agree.

Nothing in the workspace reads `dist`, so the build ends by proving it.
`tooling/build/src/fully-specify-imports.mjs` gives every relative import in `dist` its file
(`./stage/scope.js`, which Node, webpack and TypeScript's `node16` need), and writes the `.d.cts`
declarations a `require` reads. `tooling/build/src/check-framework-package.mjs` then packs the
package, runs publint and attw on the tarball, and type-checks the app in `consumer/` against it
with `vue-tsc`: the lines in `consumer/Canary.vue` marked `error expected` must fail, and nothing
else may. A failure there is what a user would get from npm.

## How the binding works

- **`<Viewer>` owns the kernel.** It creates and starts it when it mounts (never on the server),
  destroys it when it unmounts, and provides one binding: the kernel, and `track()`, which makes a
  computed depend on the kernel's one change stream.
- **Every reader is a computed.** `useKernelValue(select, isEqual)` runs `select` on every kernel
  change and on a change to any ref it reads, and keeps its value while `isEqual` says nothing
  changed, so a template updates only when what it shows did. Everything below is built on it.
- **A plugin's API is a live object.** A component's setup runs once, so `useCapability(token)`
  returns an object whose members are read from the capability the subtree resolves to now: the
  document in scope, or a stand-in while there is none (`standInFor` from `@embedpdf/core`:
  reading never throws, calling refuses with `not-ready`, the settings calls work). A method that
  returns a promise (`form.setValue`, `redaction.markPage`) then rejects, so `.catch()` sees it;
  the others throw. It never changes, so it is safe in closures and handlers.
- **The read rule, the same in every adapter.** A method named `get*`, `list*`, `is*`, `has*` or
  `can*` (the capability vocabulary's reads, `docs/conventions/naming.md`) is a read: called in a
  template, a `computed` or a `watchEffect`, it updates when its answer changes
  (`v-if="annotation.canCreate()"`). Every other method tracks nothing, so a `watchEffect` that
  calls `stage.reveal(index)` runs again only when `index` changes. Never destructure the API
  object (`const { update } = useMetadata()`): keep it, and call through it.
- **State is refs.** Without a selector, a state composable returns one ref per field
  (`const { zoomLevel } = useStageState()`), so destructuring keeps them reactive and a template
  reads them unwrapped. With a selector, it returns one ref. A composable that returns one value
  returns a ref (`usePageList()`, `usePage()`).
- **An argument that can change is a `MaybeRefOrGetter`**: `useStage(() => props.token)`,
  `useToolCursor(() => ({ … }))`.
- **Events end with the component.** `useCapabilityEvent(token, select, handler)` subscribes to
  the document in scope, again when that document changes, and stops on unmount.
- **The page context is the seam.** A page surface provides it (`providePage`), and a layer reads
  it with `usePage()`, a ref whose value changes when the page's geometry does (a zoom, a turn),
  never on a pan.
- **Scopes are provide/inject.** `<DocumentScope :id>` picks the document, `<StageScope :token>`
  (and `<Stage>` for its own pages and overlay) the stage lens.
- **Anything that touches the DOM generically** (the stage's gestures, painted images, the
  anchored placement math, cursors, the theme variables) comes from `@embedpdf/web`, shared with
  the other adapters. So does what every page surface computes: the page context
  (`makePageContext`), the surface's boxes (`pageSurfaceLayout`), the Stage's and a page view's
  projectors, the page's pointer listener (`attachPagePointer`) and the scrollbar
  (`scrollbarLayout`, `createScrollbarPresses`).

## Adding a plugin binding

The steps for a new feature, `search` as the example. React's binding
(`packages/framework/react/src/search.tsx`) is the reference for behavior; the plugin's contract
is the API.

1. **The entry.** Create `src/search.ts`, and add both lines to `package.json`:
   `"./search": "./src/search.ts"` in `exports`, and the `dist` pair in `publishConfig.exports`
   (copy one; `test/package-exports.test.ts` fails until both exist). Start the entry with what it
   is for, then re-export the plugin:

   ```ts
   /** @embedpdf/vue/search: … */
   export * from '@embedpdf/plugin-search';
   ```

2. **The API**, a live object:

   ```ts
   export function useSearch(): SearchCapability {
     return useCapability(SearchToken);
   }
   ```

3. **The state and the settings**, one line each, from the plugin's `defineState` declaration and
   its token. They return refs per field, or one ref with a selector:

   ```ts
   export const useSearchState = stateComposable(searchState);
   export const useSearchSettings = settingsComposable(SearchToken);
   ```

4. **The events**, cleaned up on unmount:

   ```ts
   export function useSearchEvent<Event>(
     select: (search: SearchCapability) => EventHook<Event>,
     handler: (event: Event) => void,
   ): void {
     useCapabilityEvent(SearchToken, select, handler);
   }
   ```

5. **A one-value reader is a ref**, built on `useOptionalSelector` (null-safe: `fallback` without
   a document) or `useKernelValue`. **A reader with an argument takes a `MaybeRefOrGetter`** and
   reads it with `toValue()` inside the select, so it follows the argument:

   ```ts
   export function useSearchHits(): Readonly<Ref<readonly SearchHit[]>> {
     return useOptionalSelector(SearchToken, (search) => search.getHits(), NO_HITS);
   }
   export function useAnnotationAnchor(annotation: MaybeRefOrGetter<AnnotationRef | null>) {
     return useOptionalSelector(AnnotationToken, (api) => anchorOf(api, toValue(annotation)), null);
   }
   ```

6. **A component** is an SFC in `src/search/`, exported from the entry
   (`export { default as SearchLayer } from './search/SearchLayer.vue'`). React's props map as the
   docs' rules say (`docs/kit/mdx/frameworks.mjs`): a value prop is a prop (`color` →
   `:color`), `onHitClick` is an event (`defineEmits<{ hitClick: [hit: SearchHit] }>()`, used as
   `@hit-click`; when the component must know whether anyone listens, as `<SearchLayer>` does to
   let matches take the pointer only then, declare it as an optional function prop `onHitClick`
   instead: `@hit-click` still works and is typed), a controlled value is a model (`defineModel('page')`, used as `v-model:page`, or
   a `page` prop with an `update:page` event when the component must tell its own changes from
   yours, as `<Stage>` does), and a render prop is a scoped slot (`renderLink` →
   `<template #link="{ link }">`, declared with `defineSlots`). Something the app hands you to
   draw (a `native` renderer) is drawn with `<component :is>`. Write the TSDoc on each prop, event
   and slot: it is what the app sees in its editor. `class` and `style` fall through to your root
   element; a component with several roots has none.

7. **A layer drawn on each page** reads the page with `usePage()` and its document through the
   usual composables (inside a page there is always one). Read `page.value` inside a computed or a
   selector, never once at setup, so it follows the page's geometry; place things in view space
   with `page.value.transform` (`pageToViewRect`, `viewScale`), and remember Vue doesn't add
   `px` to numbers in `:style`. Work with the DOM in a `watch` with `flush: 'post'` and clean up
   with `onCleanup`. A layer that paints a part of the page itself (the annotations, the form
   fields) says so with `usePaintsPagePart` (`src/page-layers.ts`), and `<RenderLayer>` leaves that
   part out of the page's picture. `RenderLayer.vue` is the example to copy.

8. **UI that floats over a page** goes in the Stage's `#overlay` slot and positions with
   `<Anchored :anchor>`; a component of yours that needs the projection reads
   `useProjectorBinding()`. A page surface of your own (a standalone page view) provides its page
   with `providePage(computed(() => makePageContext(…)))`, its document with
   `provideDocumentScope` (`src/runtime/kernel.ts`), and its projection by wrapping what floats in
   `<AnchoredScope :binding :shown>`; `src/stage/PageSurface.vue` and `src/stage/Stage.vue` show
   all three.

9. **Missing shared logic.** Anything DOM-level comes from `@embedpdf/web`. If logic every adapter
   needs is missing there, write the small piece you need next to your feature and list it as a
   candidate for `@embedpdf/web`, rather than editing a shared package.

10. **A test** in `test/search.test.ts`, the way React's binding test does it: mount through
    `viewerWith(plugins, () => h(Probe))` from `test/counter-plugin.ts`, where `probe(setup)`
    makes a component of a setup function; drive the kernel (`kernel.documents.open(…)`,
    `kernel.capability(Token)`), `await settle()`, and assert on what rendered or what a ref holds.
    Test the binding (refs update only when their value changes, events stop on unmount, the
    component's slots and models), not the plugin.

11. **Check**: `pnpm --filter @embedpdf/vue test`, `typecheck` and `build`; then the docs'
    `pnpm --filter @embedpdf/docs-content snippets` (your pages compile for Vue) and
    `samples <area>` (your examples compile).

## What the foundation provides

| Entry | Names |
| :-- | :-- |
| `runtime` | `Viewer` (`:engine`, `:plugins`, `:initial-documents`, `:identity`, `:scope`, `:accent`, `:page`, `@ready`, `#fallback`, `#error`), `DocumentGate` (`#fallback`, `#locked`, `#error`), `DocumentScope` (`:id`); `useDocuments`, `useDocument`, `useDocumentsState`, `useDocumentsEvent`, `usePageList`, `useViewerSettings`; `useKernel`, `useKernelValue`, `useCapability`, `useCapabilityRef`, `useOptionalCapability`, `useSelector`, `useOptionalSelector`, `useCapabilityEvent`, `useDocumentScope`, `useDocumentId`, `useActiveDocumentId`; `usePage`, `providePage`, `makePageContext`, `PageContextValue`; `fieldRefs`, `FieldRefs`; `saveFile`, `mountWebFont`, `epdfTheme`; everything from `@embedpdf/core` |
| `stage` | `Stage` (`#page`, `#page-chrome`, `#overlay`, `v-model:page`, `v-model:zoom`, `v-model:tool`, `:token`), `StageScope`, `Scrollbar`; `useStage`, `useStageState`, `useStageSettings`, `useStageEvent`, `useScrollMetrics`, `useStageToken`; the stage plugin |
| `render` | `RenderLayer` (`:annotations`, `:tiles`); `useRender`, `useRenderSettings`, `useRenderEvent`; the render plugin |
| `interaction` | `PagePointerSource`; `useInteraction`, `useInteractionState`, `useInteractionSettings`, `useInteractionEvent`, `useToolCursor`, `createClickCounter`; `svgCursor`, `vibrationFeedback`, `wkFeedback`; the interaction plugin |
| `anchored` | `Anchored` (`:anchor`, `placement`, `:gap`, `pinned`), `AnchoredScope`; `useProjectorBinding`, `useOptionalProjectorBinding`, `useShownPages`, `provideProjector`, `provideShownPages` |
| `.` (`src/state.ts`) | `stateComposable`, `settingsComposable`, and every entry above |

Added since by the feature agents (see each entry's source): `view-manager`, `page-edit`,
`metadata`, `actions` (`useActionsUiAdapter(handlers)`, a `MaybeRefOrGetter`); `page-view`
(`PageView` with `#fallback` and `#page-chrome`), `selection` (`SelectionLayer`,
`SelectionMenu` and `SelectionHandles` in the Stage's `#overlay`, `SelectionClipboard`), `search`
(`SearchLayer` with `@hit-click`, `useSearchHits(page?)`), `link` (`LinkLayer` with
`#link="{ link, native }"`). Never destructure a plugin's API handle (`const { update } =
useMetadata()`): setup runs once, so keep the handle and call through it.

Your app's own UI: `commands` (`useCommand(id)` is a ref, `useCommandShortcuts({ target })`
takes a template ref), `toolbar` (`Toolbar` with `#command`, `#custom="{ name, variant }"`,
`#collapsed`, `#group-trigger`, `#separator`, `#overflow-trigger`, `#overflow-menu`; a slot that
draws nothing for a part falls back to the default: `#custom` draws every custom item, and one it
draws nothing for shows its command's button; without `#custom`, each custom item is a native
`<slot>` socket), `shell` (`useSurface(id)` gives `isOpen` and
`props` as refs, so destructure it), `i18n` (`useT()` reads the language reactively). A slot
outlet can't pass a prop named `name` with `:name` (that names the outlet): bind an object,
`v-bind="{ name, variant }"`.

Annotations: `annotation` (`AnnotationLayer` with `:renderers` and the `#handle` /
`#rotation-handle` slots; a renderer's component gets `AnnotationRendererProps` and draws
`native` with `<component :is="native" />`; `AnnotationMenu`, `AnnotationDraftMenu`
(`v-slot="{ draft }"`) and `AnnotationRotationBadge` (`v-slot="{ rotation }"`) go in the Stage's
`#overlay`). `useAnnotationList(filter?)`, `useAnnotationDefaults(toolId)`,
`useAnnotationProperties(toolId?)`, `useAnnotationAnchor(ref)`, `useCommentThreads()` and
`useCommentThread(ref)` are refs and take getters; `useRichTextEditor(annotation)` gives `ref` (a
function ref, for `:ref`), `style` and `editing` (refs); `useFilePickerProvider(provider?)` takes
a provider or a ref, never a getter, because the provider is itself a function. Another entry
that needs `useAnnotationState` or `useAnnotationSettings` without the layer imports
`src/annotation/state.ts`.

Marks: `stamp` (`useStampLibraries(filter?)`, `useStampAssets(filter?)` and
`useStampAssetPreviewUrl(assetId)` are refs and take getters; the preview's object URL is revoked
when it's no longer shown), `measurement` (`usePageScale(page)`, `useMeasurementReadout(ref)`),
`redaction` (`usePendingRedactions(filter?)`). They have no components: an armed stamp, a
measurement and a redaction mark are drawn by the annotation layer.

Forms: `form` (`FormLayer` in the Stage's `#page`, above `RenderLayer` and `AnnotationLayer`;
`useFormValue(ref)` is a ref and takes a getter), `signature` (`useSignerRows()` is a ref; the
signers come with the plugin). Each control of `FormLayer` builds its box with `useWidgetBox`
(`src/form/widget-box.ts`): a composable, so the toggle's box can be its control; the press is
kept from the Stage with `isolatePointerDown`, and the widget's PDF events come from
`bindWidgetEvents` on the same box.
