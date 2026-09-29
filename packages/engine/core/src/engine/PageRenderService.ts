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

/** A local engine page's rendering: an image, or the pixels themselves. */
export interface LocalPageRenderService extends PageRenderService {
  /** The page's pixels, with the transform they were made with, not encoded as an image. */
  raw(options?: PageRenderOptions): AbortablePromise<PageRenderRaster>;
}
