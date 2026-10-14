import type {
  AnnotationAppearanceImageOptions,
  AnnotationAppearanceImagesResult,
  AnnotationAppearanceRenderOptions,
  AnnotationAppearancesResult,
} from '../dto/AnnotationRender';
import type { AbortablePromise } from '../promise/AbortablePromise';

/**
 * Per-page form service exposed via `PageHandle.forms`: the page's widget
 * images. The widgets themselves are rows of the form
 * (`doc.forms.list().widgets`).
 */
export interface PageFormsService {
  /**
   * Batch-render every widget appearance (`/AP`) on the page, every mode and
   * every state, each into its own image sized to the widget's `/Rect` —
   * what `page.annotations.renderAppearances()` does for the other
   * annotations. Gated by `doc.forms.read`.
   */
  renderAppearances(
    options?: AnnotationAppearanceImageOptions,
  ): AbortablePromise<AnnotationAppearanceImagesResult>;
}

/** A local engine page's form: the shared service and the raw appearance pixels. */
export interface LocalPageFormsService extends PageFormsService {
  /** The same appearances as `renderAppearances()`, each as its own raw RGBA raster. */
  renderAppearancesRaw(
    options?: AnnotationAppearanceRenderOptions,
  ): AbortablePromise<AnnotationAppearancesResult>;
}
