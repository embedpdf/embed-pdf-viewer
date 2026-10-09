/**
 * `<epdf-field-pictures>`: the pictures of a page's fields, as the engine draws them, from the
 * render plugin's shared field pictures. The form layer puts it under its controls. Every state
 * is loaded, so a check box shows its new state as soon as its value changes; hidden widgets
 * aren't drawn.
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
import { CapabilityBinding, injectKernelHost, injectPage } from '@embedpdf/angular/runtime';
import { annotationKey } from '@embedpdf/core';
import { FormToken as FormHostToken, type ShownWidget } from '@embedpdf/plugin-form/contract/host';
import { RenderToken } from '@embedpdf/plugin-render/contract/host';
import {
  createShownUrls,
  loadFieldPictureUrls,
  rectInPixels,
  shownFieldPicture,
  type AppearanceUrl,
} from '@embedpdf/web';

const NO_WIDGETS: readonly ShownWidget[] = Object.freeze([]);

@Component({
  selector: 'epdf-field-pictures',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A global `img { max-width: 100% }` reset would clamp a picture: the sizes are explicit.
  template: `
    @for (picture of pictures(); track picture.key) {
      <img
        alt=""
        draggable="false"
        style="position: absolute; max-width: none; max-height: none; pointer-events: none"
        [attr.src]="picture.url"
        [style.left.px]="picture.frame.left"
        [style.top.px]="picture.frame.top"
        [style.width.px]="picture.frame.width"
        [style.height.px]="picture.frame.height"
      />
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

  /** The widgets the page shows: the same array while none of them changes. */
  private readonly widgets = new CapabilityBinding(
    this.host,
    () => FormHostToken,
    () => this.page.documentId,
  ).select((form) => form.listShownWidgets(this.page.ref), NO_WIDGETS);
  /** Loaded again when the page's fields change, and at appearance-scale crossings. */
  private readonly epoch = this.render.select(
    (render) => render.getFieldAppearanceEpoch(this.page.ref),
    0,
  );
  private readonly scale = this.render.select(
    (render) => render.getAppearanceScale(this.page.transform().renderScale),
    0,
  );
  private readonly urls = signal<Record<string, AppearanceUrl>>({});
  /** The pictures shown stay valid until the next ones are shown. */
  private readonly shown = createShownUrls();

  protected readonly pictures = computed(() => {
    const urls = this.urls();
    const transform = this.page.transform();
    return this.widgets().flatMap((widget) => {
      const key = annotationKey(widget.ref);
      const picture = shownFieldPicture(urls, key, widget.appearanceState);
      return picture
        ? [{ key, url: picture.url, frame: rectInPixels(picture.box, transform) }]
        : [];
    });
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    inject(DestroyRef).onDestroy(() => this.shown.release());
    effect((onCleanup) => {
      const render = this.render.capability();
      const scale = this.scale();
      const ref = this.page.ref;
      this.epoch();
      if (!render || !scale) return;
      onCleanup(
        untracked(() =>
          loadFieldPictureUrls(
            this.shown,
            (signal) => render.renderFieldAppearances(ref, { scale, signal }),
            annotationKey,
            (urls) => this.urls.set(urls),
          ),
        ),
      );
    });
  }
}
