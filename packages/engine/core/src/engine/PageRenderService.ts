import type {
  PageImageOptions,
  PageRenderImage,
  PageRenderOptions,
  PageRenderRaster,
} from '../dto/PageRender';
import type { AbortablePromise } from '../promise/AbortablePromise';

/**
 * A render on its way: await it, cancel it with `abort()`, and re-rank it
 * with `setPriority()` while it waits (see {@link PageRenderOptions.priority}).
 */
export interface PageRenderTask<T> extends AbortablePromise<T> {
  /** The render's new priority. No effect once it runs, or on the cloud engine. */
  setPriority(priority: number): void;
}

/** `promise` as a {@link PageRenderTask} whose `setPriority` calls `setPriority`. */
export function pageRenderTask<T>(
  promise: AbortablePromise<T>,
  setPriority: (priority: number) => void,
): PageRenderTask<T> {
  return Object.assign(promise, { setPriority });
}

export interface PageRenderService {
  image(options?: PageImageOptions): PageRenderTask<PageRenderImage>;
}

/** A local engine page's rendering: an image, or the pixels themselves. */
export interface LocalPageRenderService extends PageRenderService {
  /** The page's pixels, with the transform they were made with, not encoded as an image. */
  raw(options?: PageRenderOptions): PageRenderTask<PageRenderRaster>;
}
