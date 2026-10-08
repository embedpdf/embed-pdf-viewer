import {
  AbortablePromise,
  checkImageQuality,
  EngineError,
  EngineErrorCode,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceImagesResult,
  type PageFormsService,
  type PageNetworkRenderFormat,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import { wirePaths, widgetAppearancesImageOptionsToWire } from '@embedpdf/engine-core/wire';

import { parseAppearanceForm } from './appearanceForm';
import type { ManifestAccessor } from './CloudDocumentHandle';
import { planesInherited } from './planes';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Cloud page form service: the page's widget images, one read of the
 * immutable `form/pages/{p}/appearances@` leaf at the page's `widgetVersion`,
 * at the base's URL while the layer inherits the `forms` plane.
 */
export class CloudPageFormsService implements PageFormsService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly pageRef: PageRef,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
  ) {}

  renderAppearances(
    options: AnnotationAppearanceImageOptions = {},
  ): AbortablePromise<AnnotationAppearanceImagesResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AnnotationAppearanceImagesResult>(async (signal) => {
      checkImageQuality(options.quality);
      // A content-addressed URL carries an explicit network format.
      const format: PageNetworkRenderFormat = options.format ?? 'webp';
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        const pageObjectNumber = this.pageRef.objectNumber;
        const page = manifest.pages.find((p) => p.page.objectNumber === pageObjectNumber);
        if (!page) {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `no page with object number ${pageObjectNumber} in document ${this.docId}`,
          );
        }
        const token = widgetAppearancesImageOptionsToWire(
          { ...options, format },
          { widgetVersion: page.cache.widgetVersion },
        );
        return planesInherited(manifest, ['forms'])
          ? wirePaths.docPageFormAppearances(this.docId, this.pageRef, token)
          : wirePaths.layerPageFormAppearances(this.docId, this.layerName, this.pageRef, token);
      };
      const form = await this.http.getFormDataWithRefresh(
        buildPath,
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      );
      return parseAppearanceForm(form);
    });
  }
}
