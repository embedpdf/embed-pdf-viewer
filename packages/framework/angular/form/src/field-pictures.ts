/**
 * `<epdf-field-pictures>`: the page's fields as they look now, under the form layer's controls.
 * Each widget shows its picture, as the engine draws it (the form plugin's, every state loaded, so
 * a check box shows its new state at once), or the painter's drawing while its look is pending or
 * its picture is of an older version (`pictureOrPainting`): a value, a calculation, a restyle
 * shows at once. Hidden widgets aren't drawn.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import {
  CapabilityBinding,
  EpdfSvgShapes,
  injectKernelHost,
  injectPage,
} from '@embedpdf/angular/runtime';
import { annotationKey } from '@embedpdf/core';
import { MITER_LIMIT } from '@embedpdf/core-annotation';
import { FormToken as FormHostToken, type ShownWidget } from '@embedpdf/plugin-form/contract/host';
import { RenderToken } from '@embedpdf/plugin-render/contract/host';
import {
  createShownUrls,
  loadAppearanceUrls,
  pictureOrPainting,
  rectInPixels,
  shownAppearance,
  svgShapesOf,
  type AppearanceUrl,
  type PixelRect,
  type SvgShape,
} from '@embedpdf/web';

const NO_WIDGETS: readonly ShownWidget[] = Object.freeze([]);

/** A widget as the template draws it: its picture, or the painter's shapes in its box. */
type ShownLook = { key: string; frame: PixelRect } & (
  | { kind: 'picture'; url: string }
  | { kind: 'painting'; viewBox: string; shapes: SvgShape[] }
);

@Component({
  selector: 'epdf-field-pictures',
  imports: [EpdfSvgShapes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A global `img { max-width: 100% }` reset would clamp a picture: the sizes are explicit.
  template: `
    @for (look of looks(); track look.key) {
      @if (look.kind === 'picture') {
        <img
          alt=""
          draggable="false"
          style="position: absolute; max-width: none; max-height: none; pointer-events: none"
          [attr.src]="look.url"
          [style.left.px]="look.frame.left"
          [style.top.px]="look.frame.top"
          [style.width.px]="look.frame.width"
          [style.height.px]="look.frame.height"
        />
      } @else {
        <svg
          style="position: absolute; overflow: visible; pointer-events: none"
          [attr.viewBox]="look.viewBox"
          [style.left.px]="look.frame.left"
          [style.top.px]="look.frame.top"
          [style.width.px]="look.frame.width"
          [style.height.px]="look.frame.height"
        >
          <svg:g [epdfSvgShapes]="look.shapes"></svg:g>
        </svg>
      }
    }
  `,
})
export class EpdfFieldPictures {
  private readonly page = injectPage('<epdf-form-layer>');
  private readonly host = injectKernelHost('<epdf-form-layer>');
  private readonly render = new CapabilityBinding(
    this.host,
    () => RenderToken,
    () => this.page.documentId,
  );
  private readonly form = new CapabilityBinding(
    this.host,
    () => FormHostToken,
    () => this.page.documentId,
  );

  /** The widgets the page shows: the same array while none of them changes. */
  private readonly widgets = this.form.select(
    (form) => form.listShownWidgets(this.page.ref),
    NO_WIDGETS,
  );
  /** Loaded again when one of the page's widgets is drawn again, and at appearance-scale crossings. */
  private readonly epoch = this.form.select((form) => form.getAppearanceEpoch(this.page.ref), '');
  private readonly scale = this.render.select(
    (render) => render.getAppearanceScale(this.page.transform().renderScale),
    0,
  );
  /** The pictures' URLs, by widget and state; `null` until the page's first ones arrive. */
  private readonly urls = signal<Record<string, AppearanceUrl> | null>(null);
  /** The pictures shown stay valid until the next ones are shown. */
  private readonly shown = createShownUrls();

  protected readonly looks = computed(() => {
    const urls = this.urls();
    const transform = this.page.transform();
    const form = this.form.capability();
    return this.widgets().flatMap((widget): ShownLook[] => {
      const key = annotationKey(widget.ref);
      const look = pictureOrPainting({
        pending: widget.pending,
        picture: urls && shownAppearance(urls, key, widget.appearanceState),
        version: widget.pictureVersion,
        loaded: urls !== null,
        paint: () => form?.getWidgetPainting(widget.ref) ?? null,
      });
      if (!look) return [];
      if (look.kind === 'picture') {
        return [
          {
            kind: 'picture',
            key,
            url: look.picture.url,
            frame: rectInPixels(look.picture.box, transform),
          },
        ];
      }
      const { x, y, width, height } = widget.rect;
      return [
        {
          kind: 'painting',
          key,
          viewBox: `${x} ${y} ${width} ${height}`,
          shapes: svgShapesOf(look.painting.scene, { miterLimit: MITER_LIMIT }),
          frame: rectInPixels(widget.rect, transform),
        },
      ];
    });
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    inject(DestroyRef).onDestroy(() => this.shown.release());
    effect((onCleanup) => {
      const form = this.form.capability();
      const scale = this.scale();
      const ref = this.page.ref;
      this.epoch();
      if (!form || !scale) return;
      onCleanup(
        untracked(() =>
          loadAppearanceUrls(
            this.shown,
            (signal) => form.renderAppearances(ref, scale, signal),
            annotationKey,
            (urls) => this.urls.set(urls),
          ),
        ),
      );
    });
  }
}
