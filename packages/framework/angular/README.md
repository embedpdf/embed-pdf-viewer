# @embedpdf/angular

The Angular adapter for EmbedPDF's headless viewer: providers to set it up, one service per
plugin, and standalone components for the pages and the layers on them. Zoneless and `OnPush`
throughout, built on signals, server-rendering safe (the engine only starts in the browser).

```ts
@Component({
  selector: 'app-contract',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    PercentPipe,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
        initialDocuments: [{ source: { kind: 'url', url: '/c.pdf' } }],
      },
      withStage(),
      withRender(),
    ),
  ],
  template: `
    <section *epdfDocumentGate="let document; fallback: opening">
      <button (click)="stage.zoomIn()">+</button>
      {{ stage.zoomLevel() | percent }}
      <epdf-stage #stage="epdfStage" style="height: 600px">
        <ng-template epdfPage><epdf-render-layer /></ng-template>
      </epdf-stage>
    </section>
    <ng-template #opening>Opening…</ng-template>
  `,
})
export class Contract {
  private readonly documents = inject(EpdfDocuments); // the component that provides can inject
}
```

The docs: [embedpdf.com/docs/headless/angular](https://www.embedpdf.com/docs/headless/angular).

## Entry points

One secondary entry point per feature, so a bundle carries only the features it imports.

| Entry point                      | What it has                                                                                                                                                                                                                                                                                          |
| :------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@embedpdf/angular/runtime`      | `provideEmbedPdf()`, `EpdfViewer`, `EpdfDocuments`, `EpdfDocument`, `[epdfDocumentScope]`, `*epdfDocumentGate`, the numbered errors, and what features build on: `pluginService()`, `CapabilityBinding`, `injectCapability()`, `EPDF_PAGE` / `injectPage()`, `publishPageLayerFact()`, `epdfTheme()` |
| `@embedpdf/angular/stage`        | `withStage()`, `<epdf-stage>`, `<ng-template epdfPage>` / `epdfPageChrome`, `<epdf-scrollbar>`                                                                                                                                                                                                       |
| `@embedpdf/angular/render`       | `withRender()`, `EpdfRender`, `<epdf-render-layer>`                                                                                                                                                                                                                                                  |
| `@embedpdf/angular/interaction`  | `withInteraction()`, `withFeedback()`, `EpdfInteraction` (with `overrideCursor()`), `<epdf-page-pointer-source>`                                                                                                                                                                                     |
| `@embedpdf/angular/page-view`    | `<epdf-page-view [page] [width]>`, one page without a Stage, with `epdfFallback` / `epdfPageChrome` templates                                                                                                                                                                                        |
| `@embedpdf/angular/selection`    | `withSelection()`, `EpdfSelection`, `<epdf-selection-layer>`, `<epdf-selection-menu>`, `<epdf-selection-handles>`, `<epdf-selection-clipboard>`, `copySelection()`                                                                                                                                   |
| `@embedpdf/angular/search`       | `withSearch()`, `EpdfSearch` (with `hits()` and `hitsOn(page)`), `<epdf-search-layer (hitClick)>`                                                                                                                                                                                                    |
| `@embedpdf/angular/link`         | `withLink()`, `EpdfLink`, `<epdf-link-layer>` with `<ng-template epdfLink let-link let-native="native">`                                                                                                                                                                                             |
| `@embedpdf/angular/testing`      | `EpdfStageHarness`, `EpdfSearchLayerHarness`: test harnesses on `@angular/cdk/testing`                                                                                                                                                                                                               |
| `@embedpdf/angular/anchored`     | `<epdf-anchored>`, and `EPDF_PROJECTOR`, the binding a page surface provides for it                                                                                                                                                                                                                  |
| `@embedpdf/angular/actions`      | `withActions()`, `withActionsUi(handlers)`, `EpdfActions`                                                                                                                                                                                                                                            |
| `@embedpdf/angular/metadata`     | `withMetadata()`, `EpdfMetadata` (`fields()`, and your own fields as `custom.fields()`)                                                                                                                                                                                                              |
| `@embedpdf/angular/page-edit`    | `withPageEdit()`, `EpdfPageEdit`                                                                                                                                                                                                                                                                     |
| `@embedpdf/angular/view-manager` | `withViewManager()`, `EpdfViewManager` (`panes()`, `focusedPaneId()`)                                                                                                                                                                                                                                |
| `@embedpdf/angular/commands`     | `withCommands()`, `withCommandShortcuts()`, `standardCommands`, `EpdfCommands` (with `commandOf(id)`), `[epdfCommand]` on your own buttons, `[epdfCommandShortcuts]` for the keys inside one element                                                                                                 |
| `@embedpdf/angular/toolbar`      | `<epdf-toolbar [bar]>`, its parts as templates (`epdfToolbarCommand`, `epdfToolbarCustom`, `epdfToolbarCollapsed`, `epdfToolbarGroupTrigger`, `epdfToolbarSeparator`, `epdfToolbarOverflowTrigger`, `epdfToolbarOverflowMenu`), and the bar's vocabulary (`group()`, `item()`, `custom()`, …)        |
| `@embedpdf/angular/shell`        | `withShell()`, `EpdfShell` (with `surface(id)`: `isOpen()`, `props()`, `open()`, `close()`, `toggle()`), `epdfPanelToggle` with `epdfPanelToggleExclusive`                                                                                                                                           |
| `@embedpdf/angular/i18n`         | `withI18n()`, `EpdfI18n` (with `translator()`), the `epdfT` pipe (`EpdfTPipe`)                                                                                                                                                                                                                       |
| `@embedpdf/angular/annotation`   | `withAnnotation()`, `withFilePicker()`, `EpdfAnnotation` (with `watch(filter)`, `anchorOf(ref)`, `selection.properties()`, `tools.defaultsOf(id)`), `EpdfComments` (`threads()`, `threadOf(ref)`), `<epdf-annotation-layer>` with `<ng-template [epdfAnnotation]>` / `epdfHandle` / `epdfRotationHandle`, `[epdfRichTextEditor]`, `<epdf-annotation-menu>`, `<epdf-annotation-draft-menu>`, `<epdf-annotation-rotation-badge>` |
| `@embedpdf/angular/stamp`        | `withStamp()`, `EpdfStamp` (with `libraries()`, `assetsOf(filter)`, `previewUrlOf(id)`), `persistStampLibraries()` / `restoreStampLibraries()` over the service, `indexedDbByteStore()`                                                                                                              |
| `@embedpdf/angular/measurement`  | `withMeasurement()`, `EpdfMeasurement` (with `scaleOf(page)` and `readoutOf(ref)`)                                                                                                                                                                                                                   |
| `@embedpdf/angular/redaction`    | `withRedaction()`, `EpdfRedaction` (with `pending()` and `pendingOn(page)`)                                                                                                                                                                                                                          |
| `@embedpdf/angular/form`         | `withForm()`, `EpdfForm` (with `valueOf(ref)`, and `controlOf(ref)`: a field as a Reactive Forms `FormControl`, which needs `@angular/forms`), `<epdf-form-layer>`                                                                                                                                  |
| `@embedpdf/angular/signature`    | `withSignature()`, `EpdfSignature` (with `signerRows()`), and the signers (`webCryptoSigner`, `remoteSigner`, `personalSigner`, `createTestSigner`)                                                                                                                                                   |

`scripts/check-parity.mjs` (part of `test`) lists the React entry points this package doesn't
have yet.

## How it fits together

- **`provideEmbedPdf(config, ...features)`** returns providers. Each injector that gets them (a
  component, a route, the app) has one viewer: `EpdfKernelHost` creates the kernel in the browser
  once the engine is there (a factory may return a promise), starts it, opens
  `initialDocuments`, and destroys it with the injector.
- **Signals.** The kernel has one change stream; the host turns each change into a signal write
  (`revision`), and every value the adapter shows is a `computed()` over it that keeps its value
  while nothing it reads changed (`host.read()`, `binding.select()`).
- **Services.** A plugin's service (`inject(EpdfSearch)`) has the plugin's methods, its State
  table as signals, its events as RxJS streams (`completed$`), and its settings. `pluginService()`
  builds that from the plugin's declarations. A service acts on the document of the injector
  that created it: `[epdfDocumentScope]` (and a Stage with a `[document]`) provide every service
  again, bound to their document; elsewhere a service follows the active document.
- **The read rule, the same in every adapter.** A method named `get*`, `list*`, `is*`, `has*` or
  `can*` (the capability vocabulary's reads, `docs/conventions/naming.md`) is a read: called in a
  template, a `computed()` or an `effect()`, it is read again after each change of the kernel and
  wakes its reader only when its answer changes (`[disabled]="!metadata.canUpdate()"`). Every
  other method tracks nothing. Without a document a method refuses with `not-ready`: one that
  returns a promise (`form.setValue`, `signature.placeMark`) rejects, so `.catch()` sees it, and
  the others throw. Which methods return a promise comes from the plugin's token (`promises`).
- **Components** have signal inputs and outputs; the Stage is its own API (`#stage="epdfStage"`,
  `viewChild(EpdfStage)`, `inject(EpdfStage)` inside it). **Templates** replace React's render
  functions: `<ng-template epdfPage let-page>`.
- **Errors** a developer can make while setting up have a number and the fix:
  `EPDF-101` (no viewer), `EPDF-102` (a plugin's service without its feature), `EPDF-103` (page UI
  outside a page), `EPDF-104` (Stage UI outside a Stage), `EPDF-105` (an engine call on the
  server). They link to `/docs/headless/angular/errors`.

## Adding a plugin binding

The recipe for a plugin's Angular side, with search as the example. React's binding
(`packages/framework/react/src/<plugin>.tsx`) is the reference for behavior; the plugin's
`contract.ts` and `state.ts` are the API; the page's Angular snippets
(`docs/content/snippets/<area>/<name>.angular.ts`) are the spec for the names.

### 1. The entry point

`search/ng-package.json` (copy `render/ng-package.json`), `search/src/public_api.ts`, an
`./search` entry in `package.json`'s `exports` (the same shape as the others), a line in
`src/public_api.ts`, and remove `search` from `PENDING` in `scripts/check-parity.mjs`. The entry
re-exports the plugin, so app code has one import for the feature:

```ts
/** @embedpdf/angular/search: … one line per thing it has. */
export * from '@embedpdf/plugin-search';
export * from './search';
export * from './search-layer';
```

### 2. The service and the feature

```ts
@Injectable({ providedIn: 'root' })
export class EpdfSearch extends pluginService({
  name: 'EpdfSearch', // as errors show it
  feature: 'withSearch()', // as errors show it
  token: SearchToken,
  state: searchState, // every field becomes a signal: search.hitCount()
  methods: ['search', 'clear', 'next', 'previous', 'goToHit'], // the page's Methods table
  events: ['onCompleted', 'onActiveHitChanged'], // completed$, activeHitChanged$
}) {
  // What the generic part can't build, written by hand with the protected `binding`:
  /** A value with arguments is a method that returns a signal. */
  hitsOn(page: PageRef | (() => PageRef)): Signal<readonly SearchHit[]> {
    const pageOf = typeof page === 'function' ? page : () => page;
    return this.binding.select(
      (search) => search.listHitsOn(pageOf()),
      NO_HITS,
    );
  }
}

export function withSearch(options?: SearchConfig): EmbedPdfFeature {
  return { plugins: [searchPlugin(options)], services: [EpdfSearch] };
}
```

- `settings()`, `getSettings()`, `updateSettings()`, `resetSettings()` and `settingsChanged$`
  come by themselves when the plugin declares settings; they work before any document opens.
  Don't list `getSettings` in `methods`.
- Methods are looked up when called, so a method kept in a field acts on the document current
  then; without a document a document plugin's method refuses with `not-ready`.
- A check (`can…()`, `is…()`, `has…()`) is state: read in a template, a `computed()` or an
  `effect()`, it is read again after each change of the kernel and wakes its reader only when
  its answer changes, so `[disabled]="!metadata.canUpdate()"` follows the document. Other methods
  track nothing.
- `providedIn: 'root'` is only the fallback that turns a missing feature into EPDF-102; the
  feature's `services` provides it next to the viewer and under every document scope.
- A namespace (`metadata.custom`, `annotation.selection`) is an object of its own on the service,
  built the same way (`this.binding.namespaceMethod('custom', 'update')`, `this.binding.select(…)`,
  `this.binding.stream(…)`; `metadata.ts` has one). A namespace is
  never itself a signal, and a State value never shares a name with the service or a namespace
  (`EpdfMetadata` has `fields()` and `custom.fields()`).
- A helper that needs the caller's lifetime (`interaction.overrideCursor(() => spec)`) creates
  its `effect()` in the caller's injection context; say so in its doc comment.
- App-wide setup that React does with a hook (`useCommandShortcuts()`) is a feature:
  `withCommandShortcuts()` returns `{ plugins: [], setup: () => { … } }`; `setup` runs once in the
  providers' injection context, after the viewer is created.

### 3. A component, with inputs and outputs

```ts
@Component({
  selector: 'epdf-search-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (hit of hits(); track hit.index) { … (click)="hitClick.emit(hit)" }`,
})
export class EpdfSearchLayer {
  readonly hitClick = output<SearchHit>(); // (hitClick)
  …
}
```

React's props become `input()`s (`<RenderLayer tiles>` → `[tiles]`), `onX` callbacks `output()`s
named `x` (`onHitClick` → `(hitClick)`), and a controlled value (`zoom` + `onZoomChange`) an input and an output named
`zoom` / `zoomChange`, so `[(zoom)]` works with a signal. Every component is standalone and
`OnPush`, and touches the DOM only in the browser (`isPlatformBrowser(inject(PLATFORM_ID))`).

### 4. A layer drawn on each page

A layer goes inside `<ng-template epdfPage>` and reads its page with `injectPage()`. It resolves
its plugin for the page's own document:

```ts
export class EpdfSearchLayer {
  private readonly page = injectPage('<epdf-search-layer>'); // EPDF-103 outside a page
  private readonly search = new CapabilityBinding(
    injectKernelHost('<epdf-search-layer>'),
    () => SearchToken,
    () => this.page.documentId,
  );
  protected readonly hits = this.search.select(
    (search) => search.listHitsOn(this.page.ref),
    NO_HITS,
  );
  // page.transform() places page coordinates on screen: page.transform().pageToViewRect(rect)
}
```

`page.transform()`, `page.frame()` and `page.pageIndex()` are signals that move with the
camera; the context itself never changes. Layers that must know about each other on one page
(a render layer baking annotations under an annotation layer) publish facts with
`publishPageLayerFact()`.

### 5. Custom drawing with a template

React's render prop (`renderLink={(link) => …}`) becomes a marker directive on an
`<ng-template>`, typed with a context guard, that the component reads with `contentChild()`:

```ts
export interface EpdfLinkTemplateContext {
  $implicit: LinkInfo;
}

@Directive({ selector: 'ng-template[epdfLink]' })
export class EpdfLinkTemplate {
  readonly template = inject<TemplateRef<EpdfLinkTemplateContext>>(TemplateRef);
  static ngTemplateContextGuard(_: EpdfLinkTemplate, context: unknown): context is EpdfLinkTemplateContext {
    return true;
  }
}

// In the layer: the app's template when there is one, the built-in look otherwise.
private readonly custom = contentChild(EpdfLinkTemplate);
// <ng-container [ngTemplateOutlet]="custom()?.template ?? builtIn" [ngTemplateOutletContext]="{ $implicit: link }" />
```

The app writes `<epdf-link-layer><ng-template epdfLink let-link>…</ng-template></epdf-link-layer>`.
A name that would clash gets a prefix (the toolbar's command template is `epdfToolbarCommand`,
because `epdfCommand` is the directive on your own buttons). Floating UI next to something on a
page uses `<epdf-anchored [anchor]>` inside the Stage.

A template can't draw "nothing, use the default" the way a React render prop returning
`undefined` can: a template you give draws every part of its kind. The toolbar's items of your own
are templates by name (`epdfToolbarCustom="page-number"`), and an item with no template of its name
is a native `<slot name>` socket with its command's button inside.

Two rules for templates inside a page template (`<ng-template epdfPage>`), which Angular creates
once per page: an entry the template registers (an annotation renderer) is interned, so the same
rule gives the same entry on every page and its behaviors register once; and a marker directive's
inputs are never `input.required`, because a template inside `@if` enters `contentChildren` before
its inputs are set.

### 6. A test

Tests run in vitest with happy-dom, compiling components just in time with `TestBed`, zoneless
(`vitest.config.mts` runs Angular's JIT transform on this package's files, so signal inputs and
queries work). `test/fixtures.ts` has a fake engine, a small document plugin, and `viewerHost()`
/ `mount()`:

```ts
it('reads the hit count, and empty without a document', async () => {
  const fixture = await mount(
    viewerHost({ template: '<epdf-search-layer />', imports: [EpdfSearchLayer], features: [withSearch()] }),
  );
  const search = fixture.debugElement.injector.get(EpdfSearch);
  expect(search.hitCount()).toBe(0);
  await kernelOf(fixture).documents.open(bytesInput('a'));
  …
});
```

Port the React tests that test the binding (not the plugin): empty state without a document,
signals that change only when their value does, the document scope, streams that follow the
document, outputs, the setup errors.

### 7. Checks

```sh
pnpm --filter @embedpdf/angular test         # parity + vitest
pnpm --filter @embedpdf/angular typecheck    # ngc strictTemplates + the tests with tsc
pnpm --filter @embedpdf/angular build        # ng-packagr, then the built declarations as an app reads them
pnpm --filter @embedpdf/docs-content snippets         # your pages, per framework
pnpm --filter @embedpdf/docs-content samples <area>   # your examples
```

The build ends with `scripts/check-declarations.mjs`: it imports every entry point from `dist`
with `skipLibCheck: false` and fails on any error there. The usual one is an import that doesn't
resolve, which an app (`skipLibCheck: true`) never reports: the service whose type needed it
quietly loses its members. It happens when a declaration needs a type its source file doesn't
import, and the compiler names it through another module: the entry point's own public name, or
the package that declares it, which may not be a dependency of this one. Import that type into
the file (`services.ts` imports `PluginServiceClass`), or give the member an explicit type.

An Angular example (`docs/content/samples/<area>/<name>.angular.ts`) exports its root as `App`
with `selector: 'demo-root'`, uses the React example's stylesheet with
`styleUrl: './<name>.css'` and `encapsulation: ViewEncapsulation.None`, and exports every
component in the file: `ngc` stops reporting template errors anywhere once a file has an
unexported component.
