/**
 * `<epdf-stage>`: shows the document's pages. It lays them out, keeps only the visible ones
 * mounted, handles scrolling, zoom and page navigation by mouse, keyboard and touch, and draws
 * each page with your `<ng-template epdfPage>`.
 *
 * The Stage has no service: the component is its API. A template reference gives it to your
 * template (`<epdf-stage #stage="epdfStage">`, then `stage.zoomIn()` and
 * `stage.zoomLevel()`), `viewChild(EpdfStage)` to your code, and `inject(EpdfStage)` to
 * anything inside it. It has every method of the Stage page's Methods table, every value of its
 * State table as a signal, its settings as `settings()`, and its events as streams
 * (`pageChanged$`). `[(page)]` and `[(zoom)]` bind the current page index and the zoom level.
 *
 * `[document]` opens a document for this Stage and follows the value: a new source opens, the
 * old document closes. `[token]` makes it a second view, registered with `withStage({ token })`.
 *
 * Without a document it shows no pages and its signals read their empty values; a method
 * called then refuses with `not-ready`.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  effect,
  ElementRef,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
  untracked,
  type Signal,
  type TemplateRef,
} from '@angular/core';
import { shallowEqual } from '@embedpdf/core';
import type { CapabilityToken, OpenSource, PageRef } from '@embedpdf/core';
import type { PageFrame } from '@embedpdf/core-geometry';
import {
  createScrollHandler,
  DEFAULT_SETTINGS,
  stageState,
  StageToken,
} from '@embedpdf/plugin-stage';
import type { StageCapability, StageSettings, VisiblePage } from '@embedpdf/plugin-stage';
import type { ScrollMetrics, StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { createStageSurface, stageViewProjector } from '@embedpdf/web';
import {
  CapabilityBinding,
  EPDF_DOCUMENT_SCOPE,
  EPDF_SCOPED_SERVICES,
  injectKernelHost,
  type EpdfDocumentScopeRef,
} from '@embedpdf/angular/runtime';
import { EPDF_PROJECTOR, type EpdfProjectorBinding } from '@embedpdf/angular/anchored';
import { EpdfPageSurface } from './page-surface';
import { EpdfPageChrome, EpdfPageTemplate, type EpdfPageTemplateContext } from './templates';

/** The view a Stage drives: the main one (`StageToken`), or one registered with its own token. */
export type StageTokenProp = CapabilityToken<StageCapability>;

const NO_PAGES: readonly VisiblePage[] = Object.freeze([]);
const NO_FRAME: PageFrame = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
const NO_SCROLL: ScrollMetrics = Object.freeze({
  scrollLeft: 0,
  scrollTop: 0,
  scrollWidth: 0,
  scrollHeight: 0,
  clientWidth: 0,
  clientHeight: 0,
  scrollableX: false,
  scrollableY: false,
});
const frameEqual = (left: PageFrame, right: PageFrame) =>
  left.top === right.top &&
  left.right === right.right &&
  left.bottom === right.bottom &&
  left.left === right.left;

/** The same runtime token, typed with the wider capability the Stage itself drives. */
const asHost = (token: StageTokenProp) => token as unknown as CapabilityToken<StageHostCapability>;

@Component({
  selector: 'epdf-stage',
  exportAs: 'epdfStage',
  imports: [EpdfPageSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    // What's inside talks to this Stage's document, and anchored UI projects through its camera.
    { provide: EPDF_DOCUMENT_SCOPE, useFactory: () => inject(EpdfStage).documentScope },
    { provide: EPDF_PROJECTOR, useFactory: () => inject(EpdfStage).projection },
    EPDF_SCOPED_SERVICES,
  ],
  host: {
    style: 'position: relative; display: block; overflow: hidden; touch-action: none;',
    '[style.cursor]': 'cursor()',
  },
  template: `
    @if (pageTemplate(); as template) {
      @for (visiblePage of pages(); track visiblePage.ref.objectNumber) {
        <epdf-page-surface
          [visiblePage]="visiblePage"
          [frame]="frame()"
          [documentId]="documentId() ?? ''"
          [stage]="hostCapability()!"
          [look]="look()"
          [pageTemplate]="template"
          [chromeTemplate]="chromeTemplate()"
        />
      }
    }
    <!-- What you put inside <epdf-stage> sits over the pages, in the Stage's own box. -->
    <ng-content />
  `,
})
export class EpdfStage {
  /** The view to drive: a token registered with `withStage({ token })`; the main view without one. */
  readonly token = input<StageTokenProp | undefined>(undefined);
  /** A document to open for this Stage. A new value opens it and closes the one before. */
  readonly document = input<OpenSource | null | undefined>(undefined);
  /** The current page's index, from 0: `[(page)]`. Setting it goes to that page. */
  readonly page = input<number | undefined>(undefined);
  /** Another page became the current one: its index. The output half of `[(page)]`. */
  readonly pageChange = output<number>();
  /** The zoom level, `1` for 100%: `[(zoom)]`. Setting it zooms there. */
  readonly zoom = input<number | undefined>(undefined);
  /** The zoom level changed. The output half of `[(zoom)]`. */
  readonly zoomChange = output<number>();

  private readonly host = injectKernelHost('<epdf-stage>');
  private readonly parentScope = inject(EPDF_DOCUMENT_SCOPE, { optional: true, skipSelf: true });
  private readonly openedId = signal<string | null>(null);

  /** The document this Stage shows, for what's inside it: its own `[document]`, else its scope's. */
  readonly documentScope: EpdfDocumentScopeRef = {
    id: computed(() => this.openedId() ?? this.parentScope?.id() ?? null),
  };
  private readonly binding = new CapabilityBinding<StageHostCapability>(
    this.host,
    () => asHost(this.token() ?? StageToken),
    this.documentScope.id,
  );
  /** The view's capability, or null without a document. */
  protected readonly hostCapability = this.binding.capability;

  // ── state: the Stage page's State table, one signal per value ─────────────────

  private readonly state = this.binding.select((stage) => stageState.read(stage), stageState.empty);
  /** The zoom as a number: `1` is 100%. */
  readonly zoomLevel: Signal<number> = computed(() => this.state().zoomLevel);
  /** The fit mode, such as `'fit-width'`, or `'custom'` after a pinch or an exact level. */
  readonly zoomMode = computed(() => this.state().zoomMode);
  /** The current page's place in the document, from 0. */
  readonly currentPageIndex: Signal<number> = computed(() => this.state().currentPageIndex);
  /** The current page's ref, or null before the document has pages. */
  readonly currentPage: Signal<PageRef | null> = computed(() => this.state().currentPage);
  /** How many pages the document has. */
  readonly pageCount: Signal<number> = computed(() => this.state().pageCount);
  /** How the view is turned: `0`, `90`, `180` or `270`. */
  readonly viewRotation = computed(() => this.state().viewRotation);
  /** The names of the responsive rules that apply now, in order. */
  readonly activeRules: Signal<readonly string[]> = computed(() => this.state().activeRules);
  /** The view's settings; the defaults without a document. Change them with `updateSettings()`. */
  readonly settings: Signal<StageSettings> = this.binding.select(
    (stage) => stage.getSettings(),
    DEFAULT_SETTINGS,
  );
  /** The scroll position as a scrolling element has it, in screen pixels; all zero without a document. */
  readonly scrollMetrics: Signal<ScrollMetrics> = this.binding.select(
    (stage) => stage.getScrollMetrics(),
    NO_SCROLL,
    Object.is,
  );

  // ── events, as streams ───────────────────────────────────────────────────────

  /** Another page became the current one: `page`, `pageIndex`, `previousPageIndex`. */
  readonly pageChanged$ = this.binding.stream((stage) => stage.onPageChanged);
  /** The zoom level changed: `level`, `previousLevel`, `mode`. */
  readonly zoomChanged$ = this.binding.stream((stage) => stage.onZoomChanged);
  /** The view moved, on every frame of a scroll or zoom: `camera`. */
  readonly cameraChanged$ = this.binding.stream((stage) => stage.onCameraChanged);
  /** Scrolling, a fling or an animated move came to rest: `camera`. */
  readonly motionEnded$ = this.binding.stream((stage) => stage.onMotionEnded);
  /** The Stage itself changed size: `size`. */
  readonly viewportChanged$ = this.binding.stream((stage) => stage.onViewportChanged);
  /** A setting changed, by a call or a responsive rule: `settings`, `changed`. */
  readonly settingsChanged$ = this.binding.stream((stage) => stage.onSettingsChanged);

  // ── methods: the Stage page's Methods table ──────────────────────────────────
  // Each looks the capability up when it's called, so it acts on the document shown then.

  readonly getCamera = this.binding.method('getCamera');
  readonly setCamera = this.binding.method('setCamera');
  readonly getViewportSize = this.binding.method('getViewportSize');
  readonly getZoomLevel = this.binding.method('getZoomLevel');
  readonly getZoomMode = this.binding.method('getZoomMode');
  readonly getViewRotation = this.binding.method('getViewRotation');
  readonly getCurrentPage = this.binding.method('getCurrentPage');
  readonly getCurrentPageIndex = this.binding.method('getCurrentPageIndex');
  readonly getPageCount = this.binding.method('getPageCount');
  readonly listCurrentItemPages = this.binding.method('listCurrentItemPages');
  readonly listVisiblePages = this.binding.method('listVisiblePages');
  readonly isPageVisible = this.binding.method('isPageVisible');
  readonly getViewpoint = this.binding.method('getViewpoint');
  readonly getViewState = this.binding.method('getViewState');
  readonly applyViewState = this.binding.method('applyViewState');
  readonly isMoving = this.binding.method('isMoving');
  readonly stopMotion = this.binding.method('stopMotion');

  readonly zoomTo = this.binding.method('zoomTo');
  readonly zoomBy = this.binding.method('zoomBy');
  readonly zoomIn = this.binding.method('zoomIn');
  readonly zoomOut = this.binding.method('zoomOut');
  readonly fitWidth = this.binding.method('fitWidth');
  readonly fitPage = this.binding.method('fitPage');
  readonly fitAll = this.binding.method('fitAll');
  readonly fitAutomatic = this.binding.method('fitAutomatic');

  readonly goToPage = this.binding.method('goToPage');
  readonly goToDestination = this.binding.method('goToDestination');
  readonly goToFirstPage = this.binding.method('goToFirstPage');
  readonly goToLastPage = this.binding.method('goToLastPage');
  readonly nextPage = this.binding.method('nextPage');
  readonly previousPage = this.binding.method('previousPage');
  readonly canGoNext = this.binding.method('canGoNext');
  readonly canGoPrevious = this.binding.method('canGoPrevious');
  readonly reveal = this.binding.method('reveal');
  readonly scrollTo = this.binding.method('scrollTo');
  readonly scrollBy = this.binding.method('scrollBy');
  readonly panBy = this.binding.method('panBy');
  readonly resetView = this.binding.method('resetView');

  readonly setViewRotation = this.binding.method('setViewRotation');
  readonly rotateViewBy = this.binding.method('rotateViewBy');

  readonly getSettings = this.binding.method('getSettings');
  readonly updateSettings = this.binding.method('updateSettings');
  readonly resetSettings = this.binding.method('resetSettings');
  readonly setResponsiveRules = this.binding.method('setResponsiveRules');
  readonly listActiveRules = this.binding.method('listActiveRules');
  readonly matchesRule = this.binding.method('matchesRule');

  readonly getPageAt = this.binding.method('getPageAt');
  readonly viewportToPage = this.binding.method('viewportToPage');
  readonly pageToViewport = this.binding.method('pageToViewport');
  readonly pageRectToViewport = this.binding.method('pageRectToViewport');
  readonly getPageFrame = this.binding.method('getPageFrame');

  // ── what the template draws ──────────────────────────────────────────────────

  /** The pages on screen, each with its place and transform: a new list every camera frame. */
  protected readonly pages = this.binding.select(
    (stage) => stage.listVisiblePages(),
    NO_PAGES,
    Object.is,
  );
  protected readonly frame = this.binding.select(
    (stage) => stage.getSettings().pageFrame,
    NO_FRAME,
    frameEqual,
  );
  protected readonly documentId = this.host.read(
    (kernel) => this.documentScope.id() ?? kernel.documents.getActiveId(),
    () => null,
  );
  /** The viewer's `page` settings: each page's background and shadow. */
  protected readonly look = computed(() => this.host.viewerSettings().page, {
    equal: shallowEqual,
  });
  private readonly pageTemplateDirective = contentChild(EpdfPageTemplate);
  private readonly chromeTemplateDirective = contentChild(EpdfPageChrome);
  // Typed, so the built declarations name `EpdfPageTemplateContext` from this file instead of
  // importing this entry point by its own package name.
  protected readonly pageTemplate: Signal<TemplateRef<EpdfPageTemplateContext> | null> = computed(
    () => this.pageTemplateDirective()?.template ?? null,
  );
  protected readonly chromeTemplate: Signal<TemplateRef<EpdfPageTemplateContext> | null> = computed(
    () => this.chromeTemplateDirective()?.template ?? null,
  );

  // ── input ────────────────────────────────────────────────────────────────────
  // How this view takes pointer input is its own settings: a change binds the surface again.

  private readonly interaction = this.binding.select(
    (stage) => stage.getSettings().interaction,
    true,
  );
  private readonly panFallback = this.binding.select(
    (stage) => stage.getSettings().panFallback,
    true,
  );
  private readonly zoomGestures = this.binding.select(
    (stage) => stage.getSettings().zoomGestures,
    true,
  );
  /** The interaction hub of this Stage's document: the active tool takes the pointer. */
  private readonly hub = new CapabilityBinding(
    this.host,
    () => InteractionToken,
    this.documentScope.id,
  ).capability;
  private readonly usesHub = computed(() => this.interaction() && this.hub() !== null);
  private readonly hubCursor = this.host.read(
    () => this.hub()?.getCursor() ?? 'default',
    () => 'default',
  );
  /** The hub's cursor (text, grab, a tool's own), while the hub takes this Stage's pointer. */
  protected readonly cursor = computed(() => (this.usesHub() ? this.hubCursor() : null));

  // ── anchored UI ──────────────────────────────────────────────────────────────

  /**
   * How anchored UI (`<epdf-anchored>`) inside the Stage follows the camera: a projection
   * through the view, and the visible pages as its revision, so the pages and the UI on them
   * update in the same change detection pass and never a frame apart.
   */
  readonly projection: EpdfProjectorBinding = {
    // `@embedpdf/web`'s Stage projection, shared by every framework: page boxes to the Stage's
    // own coordinates.
    projector: computed(() => {
      const stage = this.hostCapability();
      return stage ? stageViewProjector(() => stage) : null;
    }),
    revision: this.pages,
    shownPages: computed(
      () => {
        const shown = this.pages().map((visible) => visible.ref.objectNumber);
        return new Set(shown);
      },
      // The same set until a page comes on screen or leaves it.
      {
        equal: (left, right) =>
          left.size === right.size && [...left].every((objectNumber) => right.has(objectNumber)),
      },
    ),
  };

  constructor() {
    this.followDocumentInput();
    this.followPageAndZoom();
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.bindSurface();
  }

  /** `[document]`: open it for this Stage once the viewer runs; close it when the value changes. */
  private followDocumentInput(): void {
    effect((onCleanup) => {
      const source = this.document();
      const kernel = this.host.kernel();
      if (!source || !kernel || this.host.status() !== 'ready') return;
      untracked(() => {
        const cancel = new AbortController();
        const opening = kernel.documents.open(source, { signal: cancel.signal });
        // The new tab is the active one at once; its id is final when the open resolves.
        let id = kernel.documents.getActiveId();
        opening.then(
          ({ document }) => {
            id = document.id;
            if (!cancel.signal.aborted) this.openedId.set(document.id);
          },
          () => {
            // Its tab shows why it couldn't be opened.
          },
        );
        onCleanup(() => {
          cancel.abort();
          this.openedId.set(null);
          if (id && kernel.documents.has(id)) void kernel.documents.close(id).catch(() => {});
        });
      });
    });
  }

  /**
   * `[(page)]` and `[(zoom)]`. A value from the parent moves the view there; a move of the view
   * (scroll, pinch, a button) goes out as `pageChange` and `zoomChange`. When the Stage changes
   * documents (another tab), the new document keeps its own place and reports it.
   */
  private followPageAndZoom(): void {
    let previous: StageHostCapability | null = null;
    effect(() => {
      const stage = this.hostCapability();
      const page = this.page();
      const zoom = this.zoom();
      untracked(() => {
        const switched = previous !== null && stage !== null && stage !== previous;
        previous = stage;
        if (!stage) return;
        if (switched) {
          if (page !== undefined && page !== stage.getCurrentPageIndex()) {
            this.pageChange.emit(stage.getCurrentPageIndex());
          }
          if (zoom !== undefined && zoom !== stage.getZoomLevel()) {
            this.zoomChange.emit(stage.getZoomLevel());
          }
          return;
        }
        if (page !== undefined && page !== stage.getCurrentPageIndex()) stage.goToPage(page);
        if (zoom !== undefined && zoom !== stage.getZoomLevel()) stage.zoomTo(zoom);
      });
    });
    effect((onCleanup) => {
      const stage = this.hostCapability();
      if (!stage) return;
      const offPage = stage.onPageChanged(({ pageIndex }) => this.pageChange.emit(pageIndex));
      const offZoom = stage.onZoomChanged(({ level }) => this.zoomChange.emit(level));
      onCleanup(() => {
        offPage();
        offZoom();
      });
    });
  }

  /**
   * The browser side: the viewport size and pixel ratio, wheel and touch gestures, and the
   * pointer going to the interaction hub. All of it is `@embedpdf/web`'s, shared by every
   * framework, so the Stage feels the same everywhere; this binds it again when the view, the
   * hub or the input settings change.
   */
  private bindSurface(): void {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    effect((onCleanup) => {
      const stage = this.hostCapability();
      const hub = this.hub();
      const usesHub = this.usesHub();
      const panFallback = this.panFallback();
      const zoomGestures = this.zoomGestures();
      if (!stage) return;
      const detachSurface = createStageSurface(element, stage, {
        hub: usesHub ? hub : null,
        source: stage.getLensId(),
        zoomGestures,
      });
      // The pointer and this view's drag-to-scroll go to the hub together, for this view only,
      // so two Stages on one document never scroll each other.
      const offScroll =
        usesHub && hub
          ? hub.registerHandler(createScrollHandler(stage, hub, { panFallback }), {
              source: stage.getLensId(),
            })
          : null;
      onCleanup(() => {
        offScroll?.();
        detachSurface();
      });
    });
  }
}
