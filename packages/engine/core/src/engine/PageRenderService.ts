import type {
  PageImageOptions,
  PageRenderImage,
  PageRenderOptions,
  PageRenderRaster,
} from '../dto/PageRender';
import { AbortablePromise } from '../promise/AbortablePromise';

export interface PageRenderService {
  image(options?: PageImageOptions): AbortablePromise<PageRenderImage>;
}

/**
 * A page's rendering where the pixels themselves are at hand: an image, or
 * the raw pixels. The local engine's pages, and a server module's own.
 */
export interface RawPageRenderService extends PageRenderService {
  /** The page's pixels, with the transform they were made with, not encoded as an image. */
  raw(options?: PageRenderOptions): AbortablePromise<PageRenderRaster>;
}
