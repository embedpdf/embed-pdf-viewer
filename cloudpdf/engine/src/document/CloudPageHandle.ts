import type { PageHandle, PageObjectNumber } from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ManifestAccessor } from './CloudDocumentHandle';
import { CloudPageAnnotationsService } from './CloudPageAnnotationsService';
import { CloudPageGeometryService } from './CloudPageGeometryService';
import { CloudPageRenderService } from './CloudPageRenderService';
import { CloudPageTextService } from './CloudPageTextService';
import type { HttpClient } from '../transport/HttpClient';

export class CloudPageHandle implements PageHandle {
  readonly annotations: CloudPageAnnotationsService;
  readonly text: CloudPageTextService;
  readonly geometry: CloudPageGeometryService;
  readonly render: CloudPageRenderService;

  constructor(
    readonly pageObjectNumber: PageObjectNumber,
    readonly pageIndex: number,
    http: HttpClient,
    docId: string,
    layerName: string,
    isClosed: () => boolean,
    manifest: ManifestAccessor,
    publisher: SessionEventPublisher,
  ) {
    this.annotations = new CloudPageAnnotationsService(
      http,
      docId,
      layerName,
      pageObjectNumber,
      isClosed,
      manifest,
      publisher,
    );
    this.text = new CloudPageTextService(
      http,
      docId,
      layerName,
      pageObjectNumber,
      isClosed,
      manifest,
    );
    this.geometry = new CloudPageGeometryService(
      http,
      docId,
      layerName,
      pageObjectNumber,
      isClosed,
      manifest,
    );
    this.render = new CloudPageRenderService(
      http,
      docId,
      layerName,
      pageObjectNumber,
      isClosed,
      manifest,
    );
  }
}
