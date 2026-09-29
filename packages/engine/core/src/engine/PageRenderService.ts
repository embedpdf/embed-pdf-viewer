import type {
  PageImageOptions,
  PageRenderImage,
  PageRenderOptions,
  PageRenderRaster,
} from '../dto/PageRender';
import { AbortablePromise } from '../promise/AbortablePromise';

export interface PageRenderService {
  image(options?: PageImageOptions): AbortablePromise<PageRenderImage>;
  raw(options?: PageRenderOptions): AbortablePromise<PageRenderRaster>;
}
