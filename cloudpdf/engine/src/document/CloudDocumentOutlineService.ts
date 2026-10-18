import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentOutline,
} from '@embedpdf/engine-core/runtime';
import { DocumentOutlineSchema, wirePaths } from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import { planesInherited } from './planes';
import type { HttpClient } from '../transport/HttpClient';

/**
 * The read behind the cloud `doc.outline`; its verbs are one-op changes
 * through `doc.apply` (`outlineVerbs`). The outline lives at a
 * content-addressed leaf pinned by `outlineVersion` and `layoutVersion` (it
 * is read in page space). The read takes both pins from the cached
 * manifest, and on a 404 (a stale pin) refreshes the manifest and tries
 * once more. While the layer inherits both planes, one doc-level URL serves
 * every visitor.
 */
export function readCloudOutline(
  http: HttpClient,
  docId: string,
  layerName: string,
  isClosed: () => boolean,
  manifest: ManifestAccessor,
): AbortablePromise<DocumentOutline> {
  if (isClosed()) {
    return AbortablePromise.rejectReason(
      new EngineError(EngineErrorCode.DocNotOpen, `document ${docId} is closed`),
    );
  }
  return AbortablePromise.run(async (signal) => {
    const buildPath = async (s: AbortSignal): Promise<string> => {
      const current = await manifest.get(s);
      const token = {
        outlineVersion: current.outlineVersion,
        layoutVersion: current.layoutVersion,
      };
      return planesInherited(current, ['outline', 'layout'])
        ? wirePaths.docOutline(docId, token)
        : wirePaths.layerOutline(docId, layerName, token);
    };
    return http.getJsonWithRefresh(
      buildPath,
      (raw) => DocumentOutlineSchema.parse(raw),
      async (s) => {
        await manifest.refresh(s);
      },
      signal,
    );
  });
}
