/**
 * `<epdf-render-layer>`: the page's picture, in two planes.
 *
 *   - The base: one picture of the whole page, at the size the render plugin resolves (the
 *     settled demand within the pixel budget on a local engine, the advertised ladder on a
 *     cloud one). Always there; the instant backdrop.
 *   - The tiles: sharper pieces above it, when the view wants more pixels than the base may
 *     spend. A thumbnail-sized demand engages none: the arithmetic is the configuration.
 *
 * The layer only paints: plain images, bound with `@embedpdf/web`'s painted-image helper, which
 * reports each tile painted after the browser could show it. What to fetch, when to settle,
 * what to keep and when to let go are all the render plugin's; mid-gesture the pictures are
 * simply scaled with the page until the plugin hands down new ones.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  RenderToken,
  type PageLayerOptions,
  type PaintSettings,
  type RenderHostCapability,
  type TilePaintPlan,
  type TilePaintSource,
  type ViewDemand,
} from '@embedpdf/plugin-render/contract/host';
import { bindPaintedImage, partsDrawnTwice, pictureLayerOptionsOf } from '@embedpdf/web';
import {
  CapabilityBinding,
  devWarn,
  injectKernelHost,
  injectPage,
  injectPaintedParts,
  type EpdfPageContext,
} from '@embedpdf/angular/runtime';

const NO_PAINT_SETTINGS: PaintSettings = Object.freeze({ fadeMs: 0, tiles: false });
const NO_PLAN: TilePaintPlan = Object.freeze({
  engaged: false,
  paint: [],
  fetching: [],
  stamp: '',
});

/** The render plugin's host side, for the document the page belongs to. */
const renderOf = (page: EpdfPageContext, what: string) =>
  new CapabilityBinding<RenderHostCapability>(
    injectKernelHost(what),
    () => RenderToken,
    () => page.documentId,
  );

/**
 * One tile: binds the painted-image helper to the element for the tile's picture. The helper
 * hides the image until it's loaded, tells the tile's view it's painted after the browser could
 * show it, and unpainted when the element goes.
 */
@Directive({ selector: 'img[epdfTile]' })
export class EpdfTileImage {
  readonly tile = input.required<TilePaintSource>({ alias: 'epdfTile' });
  /** The view the tile is painted for; it hears when the picture is painted and when it goes. */
  readonly view = input.required<ViewDemand | null>({ alias: 'epdfTileView' });

  constructor() {
    const element = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;
    const page = injectPage('<epdf-render-layer>');
    // Bound again only for a new picture, not for every new plan that holds the same one.
    const handle = computed(() => this.tile().handle);
    // The view is told directly, not through outputs: the picture goes when the element does,
    // and an output emitted while its directive is destroyed is dropped.
    effect((onCleanup) => {
      const picture = handle();
      const view = this.view();
      const key = untracked(this.tile).key;
      onCleanup(
        bindPaintedImage(element, picture, {
          onPainted: () => view?.markPainted(page.ref, key),
          onUnpainted: () => view?.markUnpainted(page.ref, key),
        }),
      );
    });
  }
}

/**
 * The tiles: the render plugin's paint plan for this page in this view, as images keyed by
 * tile. They're placed in view pixels, not in page points under a scaled box: browsers round
 * lengths to 1/64 pixel before transforms apply, and under a 25× zoom that rounding would move
 * each tile by up to half a pixel, showing seams that shift with every zoom step.
 */
@Component({
  selector: 'epdf-tile-plane',
  imports: [EpdfTileImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The fade's keyframes, by their own name, so the inline animation finds them.
  encapsulation: ViewEncapsulation.None,
  styles: '@keyframes epdf-tile-in { from { opacity: 0 } to { opacity: 1 } }',
  template: `
    @if (plan().paint.length > 0) {
      <!-- Its own stacking context: the tiles' z-index ranks stay inside it, below the
           annotations and the page chrome, even mid-zoom while coarse and sharp tiles mix. -->
      <div
        style="position: absolute; left: 0; top: 0; pointer-events: none; isolation: isolate"
        [style.width.px]="page.transform().contentWidth"
        [style.height.px]="page.transform().contentHeight"
      >
        @for (tile of plan().paint; track tile.key) {
          <img
            alt=""
            draggable="false"
            style="position: absolute"
            [epdfTile]="tile"
            [epdfTileView]="view()"
            [style.left.px]="tile.rect.x * page.transform().viewScale"
            [style.top.px]="tile.rect.y * page.transform().viewScale"
            [style.width.px]="tile.rect.width * page.transform().viewScale"
            [style.height.px]="tile.rect.height * page.transform().viewScale"
            [style.z-index]="tile.z"
            [style.animation]="fadeMs() > 0 ? 'epdf-tile-in ' + fadeMs() + 'ms ease-out' : null"
            (load)="checkSize($event, tile)"
          />
        }
      </div>
    }
  `,
})
export class EpdfTilePlane {
  readonly layers = input.required<PageLayerOptions>();
  readonly fadeMs = input.required<number>();

  protected readonly page = injectPage('<epdf-render-layer>');
  private readonly render = renderOf(this.page, '<epdf-render-layer>');
  /**
   * This view's tile surface. Tile state is kept per view and page, so a thumbnail strip's
   * small demand never disturbs the main view's tiles.
   */
  protected readonly view = signal<ViewDemand | null>(null);
  /**
   * Which page this plane plans for: a new value only when the page changes (a page view can be
   * given another page), never with the camera.
   */
  private readonly pageRef = computed(() => this.page.ref);
  protected readonly plan = this.render.host.read(
    () => this.view()?.getPlan(this.pageRef()) ?? NO_PLAN,
    () => NO_PLAN,
  );

  constructor() {
    // The page's claim on the view, let go of when the page changes or the plane goes: that
    // stops what's still being fetched for it, and what arrived stays cached. Before the view's
    // own effect, so as the plane goes the page is released before the view is disposed.
    effect((onCleanup) => {
      const view = this.view();
      const page = this.pageRef();
      if (view) onCleanup(() => view.release(page));
    });
    effect((onCleanup) => {
      const render = this.render.capability();
      if (!render) return;
      const view = untracked(() => render.createViewDemand(this.page.view));
      this.view.set(view);
      onCleanup(() => {
        view.dispose();
        this.view.set(null);
      });
    });
    // What the view wants, on every camera frame: setting it is the one call that plans and
    // fetches; reading the paint plan above is pure.
    effect(() => {
      const view = this.view();
      const page = this.pageRef();
      const transform = this.page.transform();
      const layers = this.layers();
      if (!view) return;
      untracked(() => {
        const demand = this.page.getViewDemand?.() ?? {
          desiredDeviceWidth: transform.deviceWidth,
        };
        view.setDemand(page, demand, layers);
      });
    });
  }

  /** A picture whose size doesn't match its box would be stretched into place: a stale tile. */
  protected checkSize(event: Event, tile: TilePaintSource): void {
    const naturalWidth = (event.target as HTMLImageElement).naturalWidth;
    const expected = Math.round(tile.rect.width * tile.scale);
    if (naturalWidth > 0 && Math.abs(naturalWidth - expected) > 1) {
      devWarn(
        'tile-size',
        `[render] tile picture ${naturalWidth}px wide does not match its box (expected ` +
          `~${expected}px): a stale picture? key=${tile.key}`,
      );
    }
  }
}

@Component({
  selector: 'epdf-render-layer',
  imports: [EpdfTilePlane],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img
      #picture
      alt=""
      draggable="false"
      style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none"
    />
    @if (tiles() && paintSettings().tiles && layers(); as drawn) {
      <epdf-tile-plane [layers]="drawn" [fadeMs]="paintSettings().fadeMs" />
    }
  `,
})
export class EpdfRenderLayer {
  /**
   * Draw the annotations into the page's picture (`true`) or leave them out (`false`). Left
   * unset, the picture leaves them to an `<epdf-annotation-layer>` on the page, and otherwise
   * draws them when the user may read them.
   */
  readonly annotations = input<boolean | undefined>(undefined);
  /** The same for the form fields, which an `<epdf-form-layer>` paints. */
  readonly formFields = input<boolean | undefined>(undefined);
  /**
   * The sharp tiles over the picture when zoomed in (default true). Whether they cost anything
   * is decided by what the view wants; set it to false only for a view that must never tile.
   */
  readonly tiles = input(true);

  private readonly page = injectPage('<epdf-render-layer>');
  private readonly render = renderOf(this.page, '<epdf-render-layer>');
  /** The same object until a setting it reads changes. */
  protected readonly paintSettings = this.render.select(
    (render) => render.getPaintSettings(),
    NO_PAINT_SETTINGS,
    Object.is,
  );
  private readonly parts = computed(() => ({
    annotations: this.annotations(),
    formFields: this.formFields(),
  }));
  private readonly painted = injectPaintedParts(() => this.page.ref);
  private readonly may = this.render.select((render) => render.getLayerRights(), null, Object.is);
  /** The parts the picture draws; `null` until the page's layers have said what they paint. */
  protected readonly layers = computed(() => {
    const painted = this.painted();
    const may = this.may();
    return painted && may ? pictureLayerOptionsOf(painted, this.parts(), may) : null;
  });
  /**
   * The picture's identity: its size, the parts it draws and the page's version. Within a
   * size step it doesn't move as you zoom (the page's transform scales the picture), so
   * nothing is fetched again; it moves at a step and when the page changes.
   */
  private readonly sourceKey = this.render.select(
    (render) => {
      const layers = this.layers();
      return layers
        ? render.getSourceKey(this.page.ref, {
            scale: this.page.transform().renderScale,
            ...layers,
          })
        : null;
    },
    null,
    Object.is,
  );
  private readonly picture = viewChild.required<ElementRef<HTMLImageElement>>('picture');

  constructor() {
    effect(() => {
      const painted = this.painted();
      if (painted && partsDrawnTwice(painted, this.parts()).length > 0) {
        devWarn(
          'render-layer-draws-what-a-layer-paints',
          '<epdf-render-layer [annotations]> or [formFields] draws what an ' +
            '<epdf-annotation-layer> or an <epdf-form-layer> on the page paints too, so it shows ' +
            'twice. Leave the input out: the picture leaves out what a layer paints.',
        );
      }
    });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect((onCleanup) => {
      const render = this.render.capability();
      const key = this.sourceKey();
      const layers = this.layers();
      if (!render || key === null || !layers) return;
      const controller = new AbortController();
      let revoke: (() => void) | undefined;
      onCleanup(() => {
        controller.abort();
        revoke?.();
      });
      // Any scale inside this key's step asks for this key's picture, so reading it now is safe.
      const scale = untracked(() => this.page.transform().renderScale);
      void (async () => {
        try {
          const image = await render.renderSource(this.page.ref, {
            scale,
            ...layers,
            view: this.page.view,
            signal: controller.signal,
          });
          const objectUrl = await image.objectUrl().abortWith(controller.signal);
          if (controller.signal.aborted) {
            objectUrl.revoke();
            return;
          }
          revoke = objectUrl.revoke;
          // Set on the element now, not through a binding. A binding applies at the next change
          // detection, and the key can move on before that, revoking this URL: the image would
          // then be handed a revoked URL and lose its picture. Set at once, the browser keeps
          // showing the old picture until the new one is decoded and never asks for the old URL
          // again, so revoking it when the next one comes is safe.
          this.picture().nativeElement.src = objectUrl.url;
        } catch {
          // Cancelled (the camera moved on, the layer went away) or the render failed.
        }
      })();
    });
  }
}
