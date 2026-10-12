/**
 * `EpdfStageRef`: a Stage's API, for code that injects it. It has every method of the Stage
 * page's Methods table, every value of its State table as a signal (`zoomLevel()`,
 * `currentPageIndex()`, `pageCount()`), its settings as `settings()`, and its events as streams
 * (`pageChanged$`).
 *
 * Inside `<epdf-stage>`, `inject(EpdfStageRef)` is that Stage: the component extends this class
 * and provides itself under it, so its `[token]` view and its `[document]` are what you drive.
 * Anywhere else under a viewer it drives the main view (`StageToken`) of the document in scope
 * (`[epdfDocumentScope]`), else of the active document, as `inject(EpdfSearch)` does. Around a
 * Stage, its template reference (`#stage="epdfStage"`) or `viewChild(EpdfStage)` reaches it.
 *
 * Without a document its signals read their empty values, and a method called then refuses
 * with `not-ready`. Each method looks the view up when it's called, so it acts on the document
 * shown at that moment.
 */
import { computed, Injectable, type Signal } from '@angular/core';
import type { CapabilityToken, PageRef } from '@embedpdf/core';
import { DEFAULT_SETTINGS, stageState, StageToken } from '@embedpdf/plugin-stage';
import type { StageCapability, StageSettings } from '@embedpdf/plugin-stage';
import type { ScrollMetrics, StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import {
  CapabilityBinding,
  injectDocumentScope,
  injectKernelHost,
  type EpdfKernelHost,
} from '@embedpdf/angular/runtime';

/** The view a Stage drives: the main one (`StageToken`), or one registered with its own token. */
export type StageTokenProp = CapabilityToken<StageCapability>;

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

/** The same runtime token, typed with the wider capability the Stage itself drives. */
const asHost = (token: StageTokenProp) => token as unknown as CapabilityToken<StageHostCapability>;

@Injectable({ providedIn: 'root' })
export class EpdfStageRef {
  /** The viewer the view is in. */
  protected readonly host: EpdfKernelHost = injectKernelHost(this.usedAs());
  /** The view, for the document in scope: inside `<epdf-stage>`, the Stage's own. */
  protected readonly binding = new CapabilityBinding<StageHostCapability>(
    this.host,
    () => asHost(this.view()),
    injectDocumentScope(),
  );

  /** The view it drives: the main one. `<epdf-stage>` drives the one its `[token]` names. */
  protected view(): StageTokenProp {
    return StageToken;
  }

  /** What an error says was used without a viewer. */
  protected usedAs(): string {
    return 'inject(EpdfStageRef)';
  }

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
}
