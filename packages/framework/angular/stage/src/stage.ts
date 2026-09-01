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
import { StageToken, createScrollHandler } from '@embedpdf/plugin-stage';
import type { StageCapability, VisiblePage } from '@embedpdf/plugin-stage';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import {
  injectDocumentId,
  injectKernelHost,
  injectOptionalCapability,
  injectOptionalCapabilityFor,
  injectOptionalSelectorFor,
  type CapabilityToken,
} from '@embedpdf/angular/runtime';
import type { PageFrame } from '@embedpdf/plugin-stage';
import { createStageSurface } from '@embedpdf/web';
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
   * `pageAt`) — AND register this lens's tool-gated pan-scroll handler with it
   * (lens-scoped, so multiple stages on one document never pan each other).
   * Pan is then the `pan` tool's job and dragging in `pointer` mode selects
   * text (incl. across pages).
   *
   * Default TRUE: registering `interactionPlugin()` is the one opt-in — tools
   * just work; without the hub this is inert and the stage falls back to
   * built-in drag-to-pan, so a hub-less setup costs nothing. Set `false` on
   * SECONDARY lenses (a thumbnail rail) that should stay click-to-navigate
   * instead of feeding the document's tools.
   */
  readonly interaction = input(true);
  /**
   * With `interaction`: let drags over page GAPS pan regardless of the active
   * tool (and show a grab cursor there) — the gutter always pans; there is
   * nothing to draw/select outside a page. Default true.
   */
  readonly panFallback = input(true);
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
      const panFallback = this.panFallback();
      const zoomGestures = this.zoomGestures();
      if (!stage) return; // no document yet — nothing to drive

      const cleanups: Array<() => void> = [];
      zone.runOutsideAngular(() => {
        // The WHOLE browser binding — viewport/DPR reporting, sample
        // normalization, gesture controller — is the shared @embedpdf/web
        // surface, so every framework adapter has one feel. This component
        // keeps only Angular glue.
        cleanups.push(
          createStageSurface(el, stage, {
            hub: useHub ? ix : null,
            source: stage.lensId(),
            zoomGestures,
          }),
        );
        // Interaction opt-in lives WITH the sample source: the same knob that
        // forwards this lens's samples also registers its pan-scroll handler,
        // lens-scoped — two stages on one document can never pan each other.
        if (useHub && ix) {
          cleanups.push(
            ix.registerHandler(createScrollHandler(stage, ix, { panFallback }), {
              source: stage.lensId(),
            }),
          );
        }
      });
      onCleanup(() => cleanups.forEach((fn) => fn()));
    });
  }
}
