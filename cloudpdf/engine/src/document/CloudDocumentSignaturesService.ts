import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type AnalyzeInput,
  type ChangeAnalysis,
  type DigestAlgorithm,
  type DocumentSignaturesService,
  type FormFieldRef,
  type SignatureAbortResult,
  type SignatureCompleteInput,
  type SignatureCompleteResult,
  type SignaturePrepareInput,
  type SignaturePrepared,
  type SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';
import {
  ChangeAnalysisSchema,
  SignatureAbortResultSchema,
  SignatureCompleteResultSchema,
  SignaturePreparedWireSchema,
  SignatureSnapshotSchema,
  decodePrepared,
  toBase64,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import { buildMutationForm } from './buildMutationForm';
import type { ManifestAccessor } from './CloudDocumentHandle';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Cloud-side digital signatures. Two kinds of read, two kinds of URL:
 *
 *   - The LAYER view (`list`, and `analyze` of the working copy) is pinned
 *     by the manifest's `docVersion`, like every other layer read: a
 *     signature is a layer state change, the immutable URL moves with it.
 *   - Signed BYTES (`contents`, `digest`, `revisionBytes`, and `analyze`
 *     of history) belong to a base VERSION and are content-addressed by
 *     the manifest's `baseSha`: immutable forever, shared by every layer
 *     and every caller.
 *
 * Signing is the server's two-phase protocol over the same wire shapes
 * the local engine uses. `prepare` and `complete` change the manifest in
 * ways no delta carries (a publish moves `baseSha` itself), so both
 * refresh it before returning.
 */
export class CloudDocumentSignaturesService implements DocumentSignaturesService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
  ) {}

  list(): AbortablePromise<SignatureSnapshot> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<SignatureSnapshot>(async (signal) =>
      this.http.getJsonWithRefresh(
        async (s) => {
          const manifest = await this.manifest.get(s);
          return wirePaths.layerSignatures(this.docId, this.layerName, manifest.docVersion);
        },
        (raw) => SignatureSnapshotSchema.parse(raw),
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      ),
    );
  }

  contents(field: FormFieldRef): AbortablePromise<Uint8Array> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const manifest = await this.manifest.get(signal);
      const name = await this.fieldName(field, signal);
      return this.http.getBytes(
        wirePaths.docVersionSignatureContents(this.docId, manifest.baseSha, name),
        signal,
      );
    });
  }

  digest(field: FormFieldRef, algorithm: DigestAlgorithm): AbortablePromise<Uint8Array> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const manifest = await this.manifest.get(signal);
      const name = await this.fieldName(field, signal);
      return this.http.getBytes(
        wirePaths.docVersionSignatureDigest(this.docId, manifest.baseSha, name, algorithm),
        signal,
      );
    });
  }

  revisionBytes(revisionIndex: number): AbortablePromise<Uint8Array> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const manifest = await this.manifest.get(signal);
      return this.http.getBytes(
        wirePaths.docVersionRevision(this.docId, manifest.baseSha, revisionIndex),
        signal,
      );
    });
  }

  /**
   * `until: 'working-copy'` (or unset while the layer holds edits) judges
   * the layer's pending edits against the base at the layer URL; anything
   * else is history of the base version and resolves at the version URL.
   */
  analyze(input: AnalyzeInput): AbortablePromise<ChangeAnalysis> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<ChangeAnalysis>(async (signal) => {
      const manifest = await this.manifest.get(signal);
      const workingCopy =
        input.until === 'working-copy' || (input.until === undefined && manifest.working);
      if (workingCopy) {
        return this.http.getJsonWithRefresh(
          async (s) => {
            const current = await this.manifest.get(s);
            return wirePaths.layerSignaturesAnalysis(this.docId, this.layerName, {
              docVersion: current.docVersion,
              since: input.since,
              ...(input.exploratoryLevel !== undefined
                ? { exploratoryLevel: input.exploratoryLevel }
                : {}),
              ...(input.detail !== undefined ? { detail: input.detail } : {}),
            });
          },
          (raw) => ChangeAnalysisSchema.parse(raw),
          async (s) => {
            await this.manifest.refresh(s);
          },
          signal,
        );
      }
      return this.http.getJson(
        wirePaths.docVersionAnalysis(this.docId, manifest.baseSha, {
          since: input.since,
          ...(typeof input.until === 'object' ? { until: input.until.revisionIndex } : {}),
          ...(input.exploratoryLevel !== undefined
            ? { exploratoryLevel: input.exploratoryLevel }
            : {}),
          ...(input.detail !== undefined ? { detail: input.detail } : {}),
        }),
        (raw) => ChangeAnalysisSchema.parse(raw),
        signal,
      );
    });
  }

  prepare(input: SignaturePrepareInput): AbortablePromise<SignaturePrepared> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<SignaturePrepared>(async (signal) => {
      const { appearance, ...rest } = input;
      const body = {
        ...rest,
        ...(appearance
          ? {
              appearance: {
                resource: 'appearance',
                ...(appearance.pageIndex !== undefined ? { pageIndex: appearance.pageIndex } : {}),
              },
            }
          : {}),
      };
      const form = buildMutationForm(
        body,
        appearance
          ? {
              appearance: {
                bytes: appearance.pdf.slice().buffer as ArrayBuffer,
                mimeType: 'application/pdf',
                name: 'appearance.pdf',
              },
            }
          : {},
      );
      const prepared = await this.http.postMultipartJson(
        wirePaths.layerSignaturesPrepare(this.docId, this.layerName),
        form,
        (raw) => decodePrepared(SignaturePreparedWireSchema.parse(raw)),
        signal,
      );
      // Prepare is a layer write (layerVersion, working, docVersion moved)
      // that returns no mutation envelope: refresh, don't guess.
      await this.manifest.refresh(signal);
      this.publisher.publishLocal({
        type: 'signature.prepared',
        signingId: prepared.signingId,
        field: input.field,
      });
      return prepared;
    });
  }

  complete(input: SignatureCompleteInput): AbortablePromise<SignatureCompleteResult> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<SignatureCompleteResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerSignatureComplete(this.docId, this.layerName, input.signingId),
        { cms: toBase64(input.cms), expectedVersion: input.expectedVersion },
        (raw) => SignatureCompleteResultSchema.parse(raw),
        signal,
      );
      // A publish changes the whole manifest in substance (baseSha,
      // baseByteLength, layerVersion, working, every promoted page pin, the
      // plane pointers, the scopes): refresh on `completed` and on a
      // replay alike, then announce the new version.
      await this.manifest.refresh(signal);
      if (result.status === 'completed') {
        this.publisher.publishLocal({
          type: 'signature.completed',
          signingId: input.signingId,
          ...result,
        });
        this.publisher.publishLocal({ type: 'document.versioned', version: result.version });
      }
      return result;
    });
  }

  abort(signingId: string): AbortablePromise<SignatureAbortResult> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<SignatureAbortResult>(async (signal) => {
      const result = await this.http.deleteJson(
        wirePaths.layerSignatureAbort(this.docId, this.layerName, signingId),
        (raw) => SignatureAbortResultSchema.parse(raw),
        signal,
      );
      if (result.status === 'aborted') {
        this.publisher.publishLocal({ type: 'signature.aborted', signingId });
      }
      return result;
    });
  }

  /** Version routes address a field by its fully qualified name; an object-number ref is resolved through the snapshot. */
  private async fieldName(field: FormFieldRef, signal: AbortSignal): Promise<string> {
    if (field.kind === 'fqn') return field.name;
    const snapshot = await this.http.getJsonWithRefresh(
      async (s) => {
        const manifest = await this.manifest.get(s);
        return wirePaths.layerSignatures(this.docId, this.layerName, manifest.docVersion);
      },
      (raw) => SignatureSnapshotSchema.parse(raw),
      async (s) => {
        await this.manifest.refresh(s);
      },
      signal,
    );
    const match = snapshot.signatures.find(
      (s) =>
        s.field.kind === 'objectNumber' && s.field.fieldObjectNumber === field.fieldObjectNumber,
    );
    if (!match) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no signature field #${field.fieldObjectNumber}`,
      );
    }
    return match.fieldName;
  }

  private closedRejection(): AbortablePromise<never> | null {
    if (!this.isClosed()) return null;
    return AbortablePromise.rejectReason(
      new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
    );
  }
}
