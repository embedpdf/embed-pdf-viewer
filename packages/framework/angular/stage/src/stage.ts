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
import { createClickCounter } from './click-counter';
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

        // Wheel is ambient navigation in BOTH modes: ctrl/meta zooms (classified
        // per input by wheelZoomFactor), else scrolls. With zoom gestures off, a
        // zoom-wheel falls through to ordinary pan.
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const r = el.getBoundingClientRect();
          if (zoomGestures && (e.ctrlKey || e.metaKey)) {
            stage.zoomAround({ x: e.clientX - r.left, y: e.clientY - r.top }, wheelZoomFactor(e));
          } else {
            const dx = e.shiftKey ? e.deltaY : e.deltaX;
            const dy = e.shiftKey ? e.deltaX : e.deltaY;
            stage.panBy(-dx, -dy);
          }
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        cleanups.push(() => el.removeEventListener('wheel', onWheel));

        // Safari never synthesizes ctrl+wheel for trackpad pinch — it fires
        // proprietary gesture events carrying an ABSOLUTE scale; convert to the
        // per-event ratio the camera physics wants. Feature-detected, so Chrome
        // and Firefox pay nothing. preventDefault runs even with zoom gestures
        // off — a pinch over the stage must never zoom the page itself.
        let lastScale = 1;
        const onGestureStart = (e: Event) => {
          e.preventDefault();
          lastScale = (e as unknown as { scale?: number }).scale ?? 1;
        };
        const onGestureChange = (e: Event) => {
          e.preventDefault();
          const g = e as unknown as { scale?: number; clientX: number; clientY: number };
          const scale = g.scale ?? 1;
          if (zoomGestures && scale > 0) {
            const r = el.getBoundingClientRect();
            stage.zoomAround({ x: g.clientX - r.left, y: g.clientY - r.top }, scale / lastScale);
          }
          lastScale = scale;
        };
        if ('GestureEvent' in window) {
          el.addEventListener('gesturestart', onGestureStart);
          el.addEventListener('gesturechange', onGestureChange);
          el.addEventListener('gestureend', onGestureStart); // reset the base
          cleanups.push(() => {
            el.removeEventListener('gesturestart', onGestureStart);
            el.removeEventListener('gesturechange', onGestureChange);
            el.removeEventListener('gestureend', onGestureStart);
          });
        }

        if (useHub && ix) {
          // Forward to the hub: pan/select/etc. become tool-gated handlers.
          // `pageAt` resolves the page per event, so a drag can cross pages.
          const clicks = createClickCounter();
          const forward = (phase: PointerSample['phase'], e: PointerEvent, clickCount = 1) => {
            const r = el.getBoundingClientRect();
            const viewport = { x: e.clientX - r.left, y: e.clientY - r.top };
            ix.dispatch({
              phase,
              viewport,
              page: stage.pageAt(viewport) ?? undefined,
              // Page-anchored gestures (annotation move/resize) track the origin
              // page's frame through this even when the cursor is off that page.
              project: (pon) => stage.pointOnPage(pon, viewport),
              modifiers: { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey },
              clickCount,
            });
          };
          let dragging = false;
          const down = (e: PointerEvent) => {
            if (e.button !== 0) return;
            dragging = true;
            forward('down', e, clicks(Date.now(), e.clientX, e.clientY));
          };
          const hover = (e: PointerEvent) => {
            if (!dragging) forward('move', e); // cursor feedback, no gesture
          };
          const windowMove = (e: PointerEvent) => {
            if (dragging) forward('move', e);
          };
          const up = (e: PointerEvent) => {
            if (!dragging) return;
            dragging = false;
            forward('up', e);
          };
          el.addEventListener('pointerdown', down);
          el.addEventListener('pointermove', hover);
          window.addEventListener('pointermove', windowMove);
          window.addEventListener('pointerup', up);
          cleanups.push(() => {
            el.removeEventListener('pointerdown', down);
            el.removeEventListener('pointermove', hover);
            window.removeEventListener('pointermove', windowMove);
            window.removeEventListener('pointerup', up);
          });
        } else {
          // Built-in drag-to-pan (no interaction hub).
          let dragging = false;
          let lastX = 0;
          let lastY = 0;
          const down = (e: PointerEvent) => {
            if (e.button !== 0) return;
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
          };
          const move = (e: PointerEvent) => {
            if (!dragging) return;
            stage.panBy(e.clientX - lastX, e.clientY - lastY);
            lastX = e.clientX;
            lastY = e.clientY;
          };
          const up = () => {
            dragging = false;
          };
          el.addEventListener('pointerdown', down);
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          cleanups.push(() => {
            el.removeEventListener('pointerdown', down);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          });
        }
      });
      onCleanup(() => cleanups.forEach((fn) => fn()));
    });
  }
}
