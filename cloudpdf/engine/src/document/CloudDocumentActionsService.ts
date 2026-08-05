import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentActionsService,
  type DocumentActionsSnapshot,
} from '@embedpdf/engine-core/runtime';
import { DocumentActionsSnapshotSchema, wirePaths } from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import { planesInherited } from './planes';
import type { HttpClient } from '../transport/HttpClient';

export class CloudDocumentActionsService implements DocumentActionsService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
  ) {}

  read(): AbortablePromise<DocumentActionsSnapshot> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run((signal) =>
      this.http.getJsonWithRefresh(
        async (currentSignal) => {
          const manifest = await this.manifest.get(currentSignal);
          // Plane-scope rule: catalog actions depend on the `actions` plane
          // (constant-inherited until action writing exists) — one
          // doc-level URL, base session, no layer warm-up on open.
          return planesInherited(manifest, ['actions'])
            ? wirePaths.docActions(this.docId, manifest.actionsVersion)
            : wirePaths.layerActions(this.docId, this.layerName, manifest.actionsVersion);
        },
        (raw) => DocumentActionsSnapshotSchema.parse(raw),
        async (currentSignal) => {
          await this.manifest.refresh(currentSignal);
        },
        signal,
      ),
    );
  }
}
