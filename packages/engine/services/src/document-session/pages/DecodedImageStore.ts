import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

/** Bytes of decoded images kept between jobs: one 35-megapixel RGB image. */
export const DEFAULT_DECODED_IMAGE_BUDGET = 128 * 1024 * 1024;

/**
 * Decoded images kept between jobs, for every document on one runtime
 * (`EPDF_SetDecodedImageBudget`).
 *
 * Every job that loads a page decodes its images again, because a kept page's
 * image cache is emptied between jobs (see {@link PageResidency}). On an
 * image-heavy page that decoding is most of the time a tile takes. The store
 * keeps the decodes instead, and a kept decode renders the same bytes as a new
 * one.
 *
 * A decode depends on the image stream, its colour space and the resources
 * that name them, all of which a write in place can change. So decodes are
 * kept only while jobs that write nothing run: a write empties the store
 * before it runs and keeps it off until the next job that writes nothing. No
 * decode made before or during a change outlives it.
 */
export class DecodedImageStore {
  /** False on a runtime without `EPDF_SetDecodedImageBudget`, or with no budget. */
  readonly enabled: boolean;
  private on = false;

  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly budgetBytes: number = DEFAULT_DECODED_IMAGE_BUDGET,
  ) {
    this.enabled = budgetBytes > 0 && typeof runtime.fn.EPDF_SetDecodedImageBudget === 'function';
  }

  /** Called before every job: `writesNothing` keeps the decodes, a write drops them. */
  beginJob(writesNothing: boolean): void {
    if (!this.enabled || writesNothing === this.on) return;
    this.runtime.fn.EPDF_SetDecodedImageBudget(writesNothing ? this.budgetBytes : 0);
    this.on = writesNothing;
  }
}
