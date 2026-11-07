import type {
  PageHandle,
  PageLayerRights,
  PagePictureRights,
  PageLayout,
  PageRef,
  SessionEventPublisher,
} from '@embedpdf/engine-core/runtime';

import type { ManifestAccessor } from './CloudDocumentHandle';
import { CloudPageAnnotationsService } from './CloudPageAnnotationsService';
import { CloudPageFormsService } from './CloudPageFormsService';
import { CloudPageMeasureService } from './CloudPageMeasureService';
import { CloudPageRenderService } from './CloudPageRenderService';
import { CloudPageTextService } from './CloudPageTextService';
import type { CloudWrites } from './CloudWrites';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Cloud page handle, keyed on `ref` — the page's durable address (its
 * object number). Every service below addresses the wire by it
 * (`/pages/obj:N/…`), keys the manifest by its number, and publishes
 * that number in events.
 */
export class CloudPageHandle implements PageHandle {
  readonly annotations: CloudPageAnnotationsService;
  readonly forms: CloudPageFormsService;
  readonly text: CloudPageTextService;
  readonly render: CloudPageRenderService;
  readonly measure: CloudPageMeasureService;

  constructor(
    readonly ref: PageRef,
    http: HttpClient,
    docId: string,
    layerName: string,
    isClosed: () => boolean,
    manifest: ManifestAccessor,
    publisher: SessionEventPublisher,
    writes: CloudWrites,
    layout: (signal: AbortSignal) => Promise<PageLayout>,
    layerRights: () => PageLayerRights | null,
    pictureRights: () => PagePictureRights | null,
  ) {
    this.measure = new CloudPageMeasureService(
      http,
      docId,
      layerName,
      ref,
      isClosed,
      manifest,
      publisher,
      writes,
    );
    this.annotations = new CloudPageAnnotationsService(
      http,
      docId,
      layerName,
      ref,
      isClosed,
      manifest,
      publisher,
      writes,
    );
    this.forms = new CloudPageFormsService(http, docId, layerName, ref, isClosed, manifest);
    this.text = new CloudPageTextService(http, docId, layerName, ref, isClosed, manifest);
    this.render = new CloudPageRenderService(
      http,
      docId,
      layerName,
      ref,
      isClosed,
      manifest,
      layout,
      layerRights,
      pictureRights,
    );
  }
}
