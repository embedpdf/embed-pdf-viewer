import {
  opIdOf,
  resolveSignatureAppearance,
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type AnalyzeInput,
  type ChangeAnalysis,
  type DigestAlgorithm,
  type DocumentSignaturesService,
  type FormFieldRef,
  type SessionEventPublisher,
  type SignatureCancelResult,
  type SignatureCompleteInput,
  type SignatureCompleteResult,
  type SignaturePrepareInput,
  type SignaturePrepared,
  type SignatureSnapshot,
  type ValidationInfo,
  type ValidationInfoAddResult,
  type WriteOptions,
} from '@embedpdf/engine-core/runtime';
import {
  ChangeAnalysisSchema,
  SignatureCancelResultSchema,
  SignatureCompleteResultSchema,
  SignaturePreparedWireSchema,
  SignatureSnapshotSchema,
  VALIDATION_INFO_SINCE,
  ValidationInfoAddResultSchema,
  ValidationInfoWireSchema,
  decodePrepared,
  decodeValidationInfo,
  toBase64,
  wirePaths,
  tokenPinOf,
} from '@embedpdf/engine-core/wire';

import { buildRoleMutationForm } from './buildMutationForm';
import { assertServerTakesMark, markPart } from './signatureMark';
import type { ManifestAccessor } from './CloudDocumentHandle';
import type { CloudWrites } from './CloudWrites';
import type { HttpClient } from '../transport/HttpClient';
import { serverLacks } from '../transport/serverVersion';

/**
 * Cloud-side digital signatures. Two kinds of read, two kinds of URL:
 *
 *   - The layer view (`list`, and `analyze` of the working copy) is pinned
 *     by the manifest's `docVersion`, like every other layer read: a
 *     signature is a layer state change, the immutable URL moves with it.
 *   - Signed bytes (`contents`, `digest`, `revisionBytes`, and `analyze`
 *     of history) belong to the layer's base version (the upload, or the
 *     version its last signature made) and are content-addressed by the
 *     manifest's `baseSha256` under the layer: immutable forever.
 *
 * Signing is the server's two-phase protocol over the same wire shapes
 * the local engine uses. `prepare` and `complete` change the manifest in
 * ways no delta carries (a completion moves the layer's `baseSha256`
 * itself), so both refresh it before returning.
 *
 * Validation data (the certificates, OCSP responses and CRLs the file holds
 * for its signatures) is a layer read pinned by `docVersion` and a write
 * with a route of its own. Both, and a prepare with no field, arrived in
 * `VALIDATION_INFO_SINCE`: an older server is never sent them
 * (docs/conventions/api-evolution.md).
 */
export class CloudDocumentSignaturesService implements DocumentSignaturesService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
    private readonly writes: CloudWrites,
  ) {}

  list(): AbortablePromise<SignatureSnapshot> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<SignatureSnapshot>(async (signal) =>
      this.http.getJsonWithRefresh(
        async (s) => {
          const manifest = await this.manifest.get(s);
          return wirePaths.layerSignatures(
            this.docId,
            this.layerName,
            manifest.docVersion,
            tokenPinOf('signatures', manifest.engine),
          );
        },
        (raw) => SignatureSnapshotSchema.parse(raw),
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      ),
    );
  }

  getContents(field: FormFieldRef): AbortablePromise<Uint8Array> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const manifest = await this.manifest.get(signal);
      const name = await this.fieldName(field, signal);
      return this.http.getBytes(
        wirePaths.layerVersionSignatureContents(
          this.docId,
          this.layerName,
          manifest.baseSha256,
          name,
        ),
        signal,
      );
    });
  }

  getDigest(field: FormFieldRef, algorithm: DigestAlgorithm): AbortablePromise<Uint8Array> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const manifest = await this.manifest.get(signal);
      const name = await this.fieldName(field, signal);
      return this.http.getBytes(
        wirePaths.layerVersionSignatureDigest(
          this.docId,
          this.layerName,
          manifest.baseSha256,
          name,
          algorithm,
        ),
        signal,
      );
    });
  }

  downloadRevision(revisionIndex: number): AbortablePromise<Uint8Array> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const manifest = await this.manifest.get(signal);
      return this.http.getBytes(
        wirePaths.layerVersionRevision(
          this.docId,
          this.layerName,
          manifest.baseSha256,
          revisionIndex,
        ),
        signal,
      );
    });
  }

  /**
   * `until: 'working-copy'` judges the layer's pending edits against the
   * base at the layer URL; anything else, the default `'persisted'`
   * included, is history of the base version and resolves at the version
   * URL (the saved file, as the local engine judges by default).
   */
  analyze(input: AnalyzeInput): AbortablePromise<ChangeAnalysis> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<ChangeAnalysis>(async (signal) => {
      const manifest = await this.manifest.get(signal);
      if (input.until === 'working-copy') {
        return this.http.getJsonWithRefresh(
          async (s) => {
            const current = await this.manifest.get(s);
            return wirePaths.layerSignaturesAnalysis(this.docId, this.layerName, {
              docVersion: current.docVersion,
              pin: tokenPinOf('analysis', current.engine),
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
      // A saved version never changes, but the rules that judge it can: the URL names the
      // server's `analysis` engine value, as a token does, so its answer can be cached.
      const engine = manifest.engine.analysis;
      return this.http.getJson(
        wirePaths.layerVersionAnalysis(this.docId, this.layerName, manifest.baseSha256, {
          since: input.since,
          ...(typeof input.until === 'object' ? { until: input.until.revisionIndex } : {}),
          ...(input.exploratoryLevel !== undefined
            ? { exploratoryLevel: input.exploratoryLevel }
            : {}),
          ...(input.detail !== undefined ? { detail: input.detail } : {}),
          ...(engine !== undefined ? { engine } : {}),
        }),
        (raw) => ChangeAnalysisSchema.parse(raw),
        signal,
      );
    });
  }

  prepare(
    input: SignaturePrepareInput,
    options?: WriteOptions,
  ): AbortablePromise<SignaturePrepared> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    // An older server requires the field: it makes none for a document timestamp.
    const lacking = input.field ? null : this.serverLacks('a document timestamp with no `field`');
    if (lacking) return AbortablePromise.rejectReason(lacking);
    return AbortablePromise.run<SignaturePrepared>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const { appearance, ...rest } = input;
        // A signing with no mark sends no part: only a mark is checked.
        const read = await resolveSignatureAppearance(appearance ?? null);
        if (read) assertServerTakesMark(read, this.http.serverVersion);
        const mark = markPart(read);
        const form = buildRoleMutationForm(rest, {
          appearance: mark ? { bytes: mark } : undefined,
        });
        const prepared = await write.send((sent) =>
          this.http.postMultipartJson(
            wirePaths.layerSignaturesPrepare(this.docId, this.layerName),
            form,
            (raw) => decodePrepared(SignaturePreparedWireSchema.parse(raw)),
            signal,
            sent,
          ),
        );
        // Prepare is a layer write (layerVersion, working, docVersion moved)
        // that returns no mutation envelope: refresh, don't guess.
        await this.manifest.refresh(signal);
        // The field asked for, or the one the engine made for a document timestamp.
        const field = input.field ?? prepared.field;
        if (!field) {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            'the server prepared a signing and named no field',
          );
        }
        this.publisher.publishWrite(opId, {
          type: 'signatures.prepared',
          ...prepared,
          field,
        });
        return prepared;
      });
    });
  }

  complete(
    input: SignatureCompleteInput,
    options?: WriteOptions,
  ): AbortablePromise<SignatureCompleteResult> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<SignatureCompleteResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerSignatureComplete(this.docId, this.layerName, input.signingId),
            { cms: toBase64(input.cms), expectedVersion: input.expectedVersion },
            (raw) => SignatureCompleteResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        // A publish changes the whole manifest in substance (baseSha256,
        // baseSizeBytes, layerVersion, working, every promoted page pin, the
        // plane pointers, the scopes): refresh on `completed` and on a
        // replay alike, then announce the new version.
        await this.manifest.refresh(signal);
        if (result.status === 'completed') {
          this.publisher.publishWrite(
            opId,
            { type: 'signatures.completed', signingId: input.signingId, ...result },
            { type: 'document.versioned', version: result.version },
          );
        }
        return result;
      });
    });
  }

  cancel(signingId: string, options?: WriteOptions): AbortablePromise<SignatureCancelResult> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<SignatureCancelResult>(async (signal) => {
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.deleteJson(
            wirePaths.layerSignatureCancel(this.docId, this.layerName, signingId),
            (raw) => SignatureCancelResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        if (result.status === 'cancelled') {
          this.publisher.publishWrite(opId, { type: 'signatures.cancelled', signingId });
        }
        return result;
      });
    });
  }

  getValidationInfo(): AbortablePromise<ValidationInfo> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<ValidationInfo>(async (signal) => {
      // The server says its version on `/head`, which the manifest read makes.
      await this.manifest.get(signal);
      const lacking = this.serverLacks("reading a document's validation data");
      if (lacking) throw lacking;
      return this.http.getJsonWithRefresh(
        async (s) => {
          const manifest = await this.manifest.get(s);
          return wirePaths.layerSignaturesValidationInfo(
            this.docId,
            this.layerName,
            manifest.docVersion,
            tokenPinOf('validationInfo', manifest.engine),
          );
        },
        (raw) => decodeValidationInfo(ValidationInfoWireSchema.parse(raw)),
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      );
    });
  }

  addValidationInfo(
    input: Partial<ValidationInfo>,
    options?: WriteOptions,
  ): AbortablePromise<ValidationInfoAddResult> {
    const rejected = this.closedRejection();
    if (rejected) return rejected;
    return AbortablePromise.run<ValidationInfoAddResult>(async (signal) => {
      await this.manifest.get(signal);
      const lacking = this.serverLacks("storing a document's validation data");
      if (lacking) throw lacking;
      const opId = opIdOf(options);
      return this.writes.run(opId, signal, async (write) => {
        // Each entry as base64, as a completion carries its CMS.
        const body = {
          ...(input.certificates ? { certificates: input.certificates.map(toBase64) } : {}),
          ...(input.ocspResponses ? { ocspResponses: input.ocspResponses.map(toBase64) } : {}),
          ...(input.crls ? { crls: input.crls.map(toBase64) } : {}),
        };
        const result = await write.send((sent) =>
          this.http.postJson(
            wirePaths.layerSignaturesValidationInfoCurrent(this.docId, this.layerName),
            body,
            (raw) => ValidationInfoAddResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        // The file already held every entry: nothing was written, so nothing moved.
        const { added } = result;
        if (added.certificates + added.ocspResponses + added.crls === 0) return result;
        // Only the document version moves: no page and no list a page shows changed.
        this.manifest.apply(result.meta, []);
        this.publisher.publishWrite(opId, { type: 'signatures.validationInfoAdded', ...result });
        return result;
      });
    });
  }

  /** The refusal of something that arrived with validation data, on a server older than that. */
  private serverLacks(feature: string): EngineError | null {
    return serverLacks(this.http.serverVersion, feature, VALIDATION_INFO_SINCE);
  }

  /** Version routes address a field by its fully qualified name; an object-number ref is resolved through the snapshot. */
  private async fieldName(field: FormFieldRef, signal: AbortSignal): Promise<string> {
    if (field.kind === 'fqn') return field.name;
    const snapshot = await this.http.getJsonWithRefresh(
      async (s) => {
        const manifest = await this.manifest.get(s);
        return wirePaths.layerSignatures(
          this.docId,
          this.layerName,
          manifest.docVersion,
          tokenPinOf('signatures', manifest.engine),
        );
      },
      (raw) => SignatureSnapshotSchema.parse(raw),
      async (s) => {
        await this.manifest.refresh(s);
      },
      signal,
    );
    const match = snapshot.signatures.find(
      (s) => s.field.kind === 'objectNumber' && s.field.objectNumber === field.objectNumber,
    );
    if (!match) {
      throw new EngineError(EngineErrorCode.NotFound, `no signature field #${field.objectNumber}`);
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
