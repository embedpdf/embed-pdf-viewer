/**
 * `<epdf-stage>` — virtualizes and positions page surfaces by the camera, and
 * stamps each one with YOUR `<ng-template epdfPage>` — you bring the layers.
 *
 * NULL-SAFE BY DESIGN (a deliberate deviation from React's strict Stage):
 * Angular instantiates projected content eagerly, so a stage constructed
 * before any document exists must not crash — it renders zero pages and its
 * listeners no-op until the document arrives. Teach the document gate anyway:
 * document CHROME (toolbars, panels) still belongs behind `*epdfDocumentGate`.
 *
 * ZONE RULE: every DOM listener here attaches OUTSIDE Angular's zone — a
 * 120Hz pointermove stream must never trigger app-wide change detection.
 * State flows kernel → tick signal → computeds → bindings, so the adapter is
 * zone-agnostic (zoneless recommended, zone.js tolerated).
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
  NgZone,
  PLATFORM_ID,
} from '@angular/core';
import { StageToken, wheelZoomFactor } from '@embedpdf/plugin-stage';
import type { StageCapability, VisiblePage } from '@embedpdf/plugin-stage';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import type { PointerSample } from '@embedpdf/plugin-interaction';
import {
  injectDocumentId,
  injectKernelHost,
  injectOptionalCapability,
  injectOptionalCapabilityFor,
  injectOptionalSelectorFor,
  type CapabilityToken,
} from '@embedpdf/angular/runtime';
import type { PageFrame } from '@embedpdf/plugin-stage';
import { createStageGestureController } from '@embedpdf/web';
import type { StageGestureSink } from '@embedpdf/web';
import { EpdfPageChrome, EpdfPageTemplate } from './templates';
import { EpdfPageSurface } from './page-surface';

/** Which stage lens to bind to. Defaults to the main StageToken — pass a custom
 *  token to drive an additional lens (e.g. a wrapped thumbnail sidebar). */
export type StageTokenProp = CapabilityToken<StageCapability>;

const EMPTY_PAGES: VisiblePage[] = [];
const NO_FRAME: PageFrame = { top: 0, right: 0, bottom: 0, left: 0 };
const frameEqual = (a: PageFrame, b: PageFrame) =>
  a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

@Component({
  selector: 'epdf-stage',
  standalone: true,
  imports: [EpdfPageSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    style: 'position: relative; overflow: hidden; touch-action: none; display: block;',
    '[style.cursor]': 'cursor()',
  },
  template: `
    @if (pageTemplate(); as tpl) {
      @for (p of pages(); track p.pon) {
        <epdf-page-surface
          [vp]="p"
          [frame]="frame()"
          [documentId]="documentId() ?? ''"
          [pageTpl]="tpl"
          [chromeTpl]="chromeTemplate()"
        />
      }
    }
    <!-- viewport-space overlay UI: anything projected into <epdf-stage>
         renders above the pages (menus, controls, scrollbars). -->
    <ng-content />
  `,
})
export class EpdfStage {
  /**
   * Route this Stage's pointer events to the interaction hub (page-resolved via
   * `pageAt`) instead of the built-in drag-to-pan. Pan then becomes the `pan`
   * tool's job and dragging in `pointer` mode selects text (incl. across pages).
   * Pair with `stagePlugin({ interaction: true })`. Default false (built-in pan).
   */
  readonly interaction = input(false);
  /**
   * Ambient ZOOM gestures on this stage: ctrl/cmd+wheel and trackpad pinch
   * (Safari gesture events included). Default true. Turn OFF for follower
   * lenses with a fixed magnification (a thumbnail rail should scroll under
   * cmd+wheel, not zoom); pinches are still swallowed either way.
   */
  readonly zoomGestures = input(true);
  /** The stage lens to drive (default: the main StageToken). */
  readonly token = input<StageTokenProp>(StageToken);

  private readonly host = injectKernelHost();
  private readonly stage = injectOptionalCapabilityFor(() => this.token());
  private readonly ix = injectOptionalCapability(InteractionToken);
  private readonly useHub = computed(() => this.interaction() && this.ix() !== null);
  // The hub's resolved cursor (text/grab/…), applied to the viewport when driving.
  private readonly hubCursor = this.host.value(() => this.ix()?.cursor() ?? 'default');
  protected readonly cursor = computed(() => (this.useHub() ? this.hubCursor() : null));

  protected readonly documentId = injectDocumentId();
  // visiblePages already folds in the camera (each page carries its
  // device-snapped screenX/screenY + transform), so panning re-emits the list —
  // no separate camera subscription needed for positioning. The capability
  // memoizes, so Object.is equality suffices.
  protected readonly pages = injectOptionalSelectorFor(
    () => this.token(),
    (c) => c.visiblePages(),
    EMPTY_PAGES,
  );
  // Reserved chrome bands (screen px), uniform across pages — the frame the
  // outer box reserves and the chrome template paints into.
  protected readonly frame = injectOptionalSelectorFor(
    () => this.token(),
    (c) => c.pageFrame(),
    NO_FRAME,
    frameEqual,
  );

  private readonly pageTemplateDir = contentChild(EpdfPageTemplate);
  private readonly chromeTemplateDir = contentChild(EpdfPageChrome);
  protected readonly pageTemplate = computed(() => this.pageTemplateDir()?.template ?? null);
  protected readonly chromeTemplate = computed(() => this.chromeTemplateDir()?.template ?? null);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const el = inject(ElementRef).nativeElement as HTMLElement;
    const zone = inject(NgZone);

    // Rebinds when the stage capability (document open/close/switch, token
    // change), hub, or gesture flags change — the Angular spelling of the React
    // Stage effect and its dependency array.
    effect((onCleanup) => {
      const stage = this.stage();
      const ix = this.ix();
      const useHub = this.interaction() && !!ix;
      const zoomGestures = this.zoomGestures();
      if (!stage) return; // no document yet — nothing to drive

      const cleanups: Array<() => void> = [];
      zone.runOutsideAngular(() => {
        // Only report the viewport size. Initial placement (home) is the Stage
        // plugin's job — the shell stays dumb.
        const setViewport = () =>
          stage.setViewport({ width: el.clientWidth, height: el.clientHeight });
        const resizeObserver = new ResizeObserver(setViewport);
        resizeObserver.observe(el);
        setViewport();
        cleanups.push(() => resizeObserver.disconnect());

        // Report the device pixel ratio so page transforms render crisp. dppx
        // changes (zoom, dragging between monitors) fire the media query;
        // re-subscribe each time since the query value itself moves.
        let mq: MediaQueryList | null = null;
        const reportDpr = () => {
          stage.setDevicePixelRatio(window.devicePixelRatio || 1);
          mq?.removeEventListener('change', reportDpr);
          mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
          mq.addEventListener('change', reportDpr);
        };
        reportDpr();
        cleanups.push(() => mq?.removeEventListener('change', reportDpr));

        // ALL gesture input — wheel, Safari trackpad gestures, mouse/pen tool
        // routing, and the synthesized touch physics (pan/pinch/fling/tap/
        // long-press) — lives in the shared @embedpdf/web controller, so every
        // framework adapter has one feel. The sink is the hub bridge: it
        // converts events to page-resolved samples exactly as before (`pageAt`
        // per event, so a drag can cross pages).
        const sampleOf = (
          phase: PointerSample['phase'],
          e: PointerEvent,
          clickCount = 1,
        ): PointerSample => {
          const r = el.getBoundingClientRect();
          const viewport = { x: e.clientX - r.left, y: e.clientY - r.top };
          return {
            phase,
            viewport,
            page: stage.pageAt(viewport) ?? undefined,
            // Page-anchored gestures (annotation move/resize) track the origin
            // page's frame through this even when the cursor is off that page.
            project: (pon) => stage.pointOnPage(pon, viewport),
            modifiers: { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey },
            clickCount,
            pointerType: (e.pointerType || 'mouse') as PointerSample['pointerType'],
          };
        };
        const forward = (phase: PointerSample['phase'], e: PointerEvent, clickCount = 1) => {
          ix?.dispatch(sampleOf(phase, e, clickCount));
        };
        const sink: StageGestureSink | null =
          useHub && ix
            ? {
                down: (e, clickCount) => forward('down', e, clickCount),
                move: (e) => forward('move', e),
                up: (e) => forward('up', e),
                cancel: (e) => forward('cancel', e),
                hover: (e) => forward('move', e), // no owner → the hub routes to onHover
                // Touch long-press = a word-select down (clickCount 2): the
                // mobile entry into text selection.
                longPress: (e) => forward('down', e, 2),
                // Touch consent: an armed drawing/markup tool takes fingers
                // wholesale; otherwise per-point claims (a selected
                // annotation's body or handles) decide. Pure pre-flight.
                claimsPoint: (e) =>
                  !!ix.activeTool().touchDirect || ix.wouldClaimTouch(sampleOf('down', e)),
              }
            : null;
        cleanups.push(
          createStageGestureController(el, stage, { zoomGestures, wheelZoomFactor, sink }),
        );
      });
      onCleanup(() => cleanups.forEach((fn) => fn()));
    });
  }
}
