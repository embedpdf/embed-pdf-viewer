import type { PageHandle, PageRef } from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ManifestAccessor } from './CloudDocumentHandle';
import { CloudPageAnnotationsService } from './CloudPageAnnotationsService';
import { CloudPageGeometryService } from './CloudPageGeometryService';
import { CloudPageRenderService } from './CloudPageRenderService';
import { CloudPageTextService } from './CloudPageTextService';
import { CloudPageMeasureService } from './CloudPageMeasureService';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Cloud page handle, keyed on `ref` — the page's durable address (its
 * object number). Every service below addresses the wire by it
 * (`/pages/obj:N/…`), keys the manifest by its number, and publishes
 * that number in events.
 */
export class CloudPageHandle implements PageHandle {
  readonly annotations: CloudPageAnnotationsService;
  readonly text: CloudPageTextService;
  readonly geometry: CloudPageGeometryService;
  readonly render: CloudPageRenderService;
  readonly measure: CloudPageMeasureService;

  constructor(
    readonly ref: PageRef,
    readonly pageIndex: number,
    http: HttpClient,
    docId: string,
    layerName: string,
    isClosed: () => boolean,
    manifest: ManifestAccessor,
    publisher: SessionEventPublisher,
  ) {
    this.measure = new CloudPageMeasureService(
      http,
      docId,
      layerName,
      ref,
      isClosed,
      manifest,
      publisher,
    );
    this.annotations = new CloudPageAnnotationsService(
      http,
      docId,
      layerName,
      ref,
      isClosed,
      manifest,
      publisher,
    );
    this.text = new CloudPageTextService(http, docId, layerName, ref, isClosed, manifest);
    this.geometry = new CloudPageGeometryService(http, docId, layerName, ref, isClosed, manifest);
    this.render = new CloudPageRenderService(http, docId, layerName, ref, isClosed, manifest);
  }
}
