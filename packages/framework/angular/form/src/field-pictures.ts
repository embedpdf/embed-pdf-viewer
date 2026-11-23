/**
 * The page's fields as they look now, under the form layer's controls. Each widget shows its
 * picture, as the engine draws it (the form plugin's, every state loaded, so a check box shows
 * its new state at once), or the painter's drawing while its look is pending or its picture is
 * of an older version (`pictureOrPainting`): a value, a calculation, a restyle shows at once.
 * Hidden widgets aren't drawn.
 *
 *   injectFieldLooks()        every widget's look on the page, for the layer
 *   <epdf-field-pictures>     the looks it's given, each at its widget's box: a moved widget
 *                             keeps its picture and takes it along
 *
 * The layer gives `<epdf-field-pictures>` the looks of the boxes it draws itself; a box a
 * control of the app's draws gets its look inside that control (`custom-control.ts`).
 */
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
  type Signal,
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

/**
 * A widget as a template draws it: its picture, or the painter's shapes in its box. `key` is
 * the widget's (`annotationKey`), `frame` where it stands in the page layer's pixels.
 */
export type ShownLook = { key: string; frame: PixelRect } & (
  | { kind: 'picture'; url: string }
  | { kind: 'painting'; viewBox: string; shapes: SvgShape[] }
);

@Component({
  selector: 'epdf-field-pictures',
  imports: [EpdfSvgShapes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A global `img { max-width: 100% }` reset would clamp a picture: the sizes are explicit.
  template: `
    @for (look of shown(); track look.key) {
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
  /**
   * The looks to draw, each at its widget's box. The layer hands over the signal, not its
   * value, and this template reads it: a picture that arrives checks the pictures, not the
   * layer's template and every control's box with it.
   */
  readonly looks = input.required<Signal<readonly ShownLook[]>>();

  protected readonly shown = computed(() => this.looks()());
}

/**
 * The look of every widget the page shows, in the order the page draws them: the same array
 * while none of them changes. It loads the page's pictures again when one of its widgets is
 * drawn again, and at appearance-scale crossings. Call it in the layer's injection context: the
 * pictures are released with the layer.
 */
export function injectFieldLooks(): Signal<readonly ShownLook[]> {
  const page = injectPage('<epdf-form-layer>');
  const host = injectKernelHost('<epdf-form-layer>');
  const render = new CapabilityBinding(
    host,
    () => RenderToken,
    () => page.documentId,
  );
  const form = new CapabilityBinding(
    host,
    () => FormHostToken,
    () => page.documentId,
  );

  /** The widgets the page shows: the same array while none of them changes. */
  const widgets = form.select((lens) => lens.listShownWidgets(page.ref), NO_WIDGETS);
  /** Loaded again when one of the page's widgets is drawn again, and at appearance-scale crossings. */
  const epoch = form.select((lens) => lens.getAppearanceEpoch(page.ref), '');
  const scale = render.select((lens) => lens.getAppearanceScale(page.transform().renderScale), 0);
  /** The pictures' URLs, by widget and state; `null` until the page's first ones arrive. */
  const urls = signal<Record<string, AppearanceUrl> | null>(null);
  /** The pictures shown stay valid until the next ones are shown. */
  const shown = createShownUrls();

  const looks = computed(() => {
    const loaded = urls();
    const transform = page.transform();
    const lens = form.capability();
    return widgets().flatMap((widget): ShownLook[] => {
      const key = annotationKey(widget.ref);
      const look = pictureOrPainting({
        pending: widget.pending,
        picture: loaded && shownAppearance(loaded, key, widget.appearanceState),
        version: widget.pictureVersion,
        loaded: loaded !== null,
        paint: () => lens?.getWidgetPainting(widget.ref) ?? null,
      });
      if (!look) return [];
      // Where the widget is now: a move keeps its picture, which comes along with it.
      const frame = rectInPixels(widget.rect, transform);
      if (look.kind === 'picture') {
        return [{ kind: 'picture', key, url: look.picture.url, frame }];
      }
      const { x, y, width, height } = widget.rect;
      return [
        {
          kind: 'painting',
          key,
          viewBox: `${x} ${y} ${width} ${height}`,
          shapes: svgShapesOf(look.painting.scene, { miterLimit: MITER_LIMIT }),
          frame,
        },
      ];
    });
  });

  if (!isPlatformBrowser(inject(PLATFORM_ID))) return looks;
  inject(DestroyRef).onDestroy(() => shown.release());
  effect((onCleanup) => {
    const lens = form.capability();
    const at = scale();
    const ref = page.ref;
    epoch();
    if (!lens || !at) return;
    onCleanup(
      untracked(() =>
        loadAppearanceUrls(
          shown,
          (signal) => lens.renderAppearances(ref, at, signal),
          annotationKey,
          (loaded) => urls.set(loaded),
        ),
      ),
    );
  });
  return looks;
}
