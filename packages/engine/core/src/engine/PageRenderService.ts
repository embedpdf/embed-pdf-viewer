import type {
  PageImageHandle,
  PageImageOptions,
  PageRenderOptions,
  PageRaster,
} from '../dto/PageRender';
import { AbortablePromise } from '../promise/AbortablePromise';

export interface PageRenderService {
  image(options?: PageImageOptions): AbortablePromise<PageImageHandle>;
  raw(options?: PageRenderOptions): AbortablePromise<PageRaster>;
}
