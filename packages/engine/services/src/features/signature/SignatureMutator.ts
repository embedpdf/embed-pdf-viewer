import type {
  DigestAlgorithm,
  DocumentVersionRef,
  SignatureAbortResult,
  SignatureCompleteInput,
  SignatureCompleteResult,
  SignaturePrepareInput,
  SignaturePrepared,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import {
  FileCandidateStore,
  MemoryCandidateStore,
  type CandidateStore,
} from './internal/candidateStore';
import { bakeWidgetAppearance } from './internal/appearance';
import { assertSealedSignature, bytesEqual, type SealExpectation } from './internal/sealCheck';
import { disposeSignatureModel } from './internal/signatureModelCache';
import { DIGEST_CODE, SignatureReader } from './SignatureReader';
import type { DocumentSession } from '../../document-session/DocumentSession';
import type { BaseDocumentRegistry } from '../../document-session/lifecycle/BaseDocumentRegistry';
import {
  CloseStack,
  openLayerDocument,
  type LayerSource,
  type OpenedPdfDocument,
} from '../../document-session/lifecycle/PdfDocumentOpener';
import { withScratch } from '../../runtime/memory/scratch';
import { generateUuid } from '../../shared/uuid';
import { disposeFormModel } from '../forms/internal/formModelCache';
import { withWideStringArray } from '../forms/internal/wideStringArray';
import { DocumentSaver } from '../save/DocumentSaver';

// Mirrors public/epdf_signature.h.
const SUBFILTER_CODE = {
  'adbe.pkcs7.detached': 0,
  'ETSI.CAdES.detached': 1,
  'ETSI.RFC3161': 2,
} as const;
const FIELD_ACTION_CODE = { all: 1, include: 2, exclude: 3 } as const;
const DEFAULT_CONTENTS_SIZE = 8192;
const MIN_CONTENTS_SIZE = 256;
const MAX_CONTENTS_SIZE = 4 * 1024 * 1024;

/**
 * `EPDF_SIG_PREPARE` as the C compiler lays it out. Two layouts: ILP32
 * (wasm32: int, unsigned long and pointers are 4 bytes) and LP64 (the
 * native darwin/linux runtimes: unsigned long and pointers are 8 bytes,
 * 8-aligned). Field order follows the header.
 */
interface PrepareLayout {
  bytes: number;
  ptrBytes: number;
  subfilter: number;
  digest: number;
  contentsSize: number;
  name: number;
  reason: number;
  location: number;
  contactInfo: number;
  signingTime: number;
  docmdpPermission: number;
  fieldmdpAction: number;
  fieldmdpFields: number;
  fieldmdpFieldCount: number;
  lockPermission: number;
}
const PREPARE_ILP32: PrepareLayout = {
  bytes: 52,
  ptrBytes: 4,
  subfilter: 0,
  digest: 4,
  contentsSize: 8,
  name: 12,
  reason: 16,
  location: 20,
  contactInfo: 24,
  signingTime: 28,
  docmdpPermission: 32,
  fieldmdpAction: 36,
  fieldmdpFields: 40,
  fieldmdpFieldCount: 44,
  lockPermission: 48,
};
const PREPARE_LP64: PrepareLayout = {
  bytes: 80,
  ptrBytes: 8,
  subfilter: 0,
  digest: 4,
  contentsSize: 8,
  name: 16,
  reason: 24,
  location: 32,
  contactInfo: 40,
  signingTime: 48,
  docmdpPermission: 56,
  fieldmdpAction: 60,
  fieldmdpFields: 64,
  fieldmdpFieldCount: 72,
  lockPermission: 76,
};

/**
 * The two-phase signing protocol on a session, local and native alike.
 *
 * `prepare` never touches the live document: it builds a CANDIDATE — a
 * fresh layer over the session's own immutable base (see `openCandidate`)
 * — writes the signature there, saves it through a `CandidateStore`
 * (memory locally, a file beside the base on file-backed sessions), seals
 * it, and parks the saved candidate on the session. `complete` writes the
 * CMS into it, opens it as a new base with a fresh layer, proves the new
 * signature seals a whole revision, and installs it as the session's
 * document. `abort` discards the candidate.
 */
export class SignatureMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    private readonly baseDocuments: BaseDocumentRegistry,
    /** Where a file-backed session's candidate is written; defaults to beside the base file. */
    private readonly candidatePath?: (basePath: string, signingId: string) => string,
  ) {}

  prepare(input: SignaturePrepareInput): SignaturePrepared {
    if (this.session.pendingSigning) {
      throw new EngineError(
        EngineErrorCode.SigningPending,
        `a signing is pending (${this.session.pendingSigning.prepared.signingId}); complete or abort it first`,
      );
    }
    const reader = new SignatureReader(this.runtime, this.session);
    const field = reader.resolveField(input.field);
    if (field.signed) {
      throw new EngineError(
        EngineErrorCode.SignatureRefused,
        'the signature field is already signed',
      );
    }
    if (input.appearance && !field.widget) {
      throw new EngineError(
        EngineErrorCode.SignatureRefused,
        'the signature field has no widget to carry an appearance',
      );
    }
    const algorithm: Exclude<DigestAlgorithm, 'sha1'> = input.digest ?? 'sha256';
    if (!(algorithm in DIGEST_CODE) || algorithm === ('sha1' as string)) {
      throw new EngineError(EngineErrorCode.SignatureRefused, `unsupported digest '${algorithm}'`);
    }
    const kind = input.kind ?? 'signature';
    const subFilter: keyof typeof SUBFILTER_CODE =
      kind === 'timestamp' ? 'ETSI.RFC3161' : (input.subFilter ?? 'ETSI.CAdES.detached');
    if (!(subFilter in SUBFILTER_CODE)) {
      throw new EngineError(
        EngineErrorCode.SignatureRefused,
        `unsupported subFilter '${subFilter}'`,
      );
    }
    const contentsSize = input.contentsSize ?? DEFAULT_CONTENTS_SIZE;
    if (
      !Number.isInteger(contentsSize) ||
      contentsSize < MIN_CONTENTS_SIZE ||
      contentsSize > MAX_CONTENTS_SIZE
    ) {
      throw new EngineError(
        EngineErrorCode.SignatureRefused,
        `contentsSize must be an integer in [${MIN_CONTENTS_SIZE}, ${MAX_CONTENTS_SIZE}]`,
      );
    }
    const expectedVersion = this.session.versionRef(reader.version().sha256);

    const signingId = generateUuid();
    const stack = new CloseStack();
    try {
      const candidate = this.openCandidate(signingId);
      stack.push(() => candidate.close());

      // `signer` is the pre-rename wire spelling: older clients still send it.
      const attribution =
        input.attribution ??
        (input as { signer?: SignaturePrepareInput['attribution'] }).signer;
      const valueObjNum = this.callPrepare(candidate.docPtr, field.fieldObjectNumber, {
        subfilter: SUBFILTER_CODE[subFilter],
        digest: DIGEST_CODE[algorithm],
        contentsSize,
        name: attribution?.name ?? null,
        reason: attribution?.reason ?? null,
        location: attribution?.location ?? null,
        contactInfo: attribution?.contactInfo ?? null,
        signingTime: input.signingTime ?? null,
        docmdpPermission: input.certify?.permission ?? 0,
        fieldmdpAction: input.lock ? FIELD_ACTION_CODE[input.lock.action] : 0,
        fieldmdpFields: input.lock?.action === 'all' ? [] : (input.lock?.fields ?? []),
        lockPermission: input.lock?.permission ?? 0,
      });
      if (valueObjNum === 0) {
        throw new EngineError(
          EngineErrorCode.SignatureRefused,
          'the engine refused to author the signature (the field is signed, read-only or locked, a certification is not allowed here, the seed value requires what is not implemented, or the request is inconsistent)',
        );
      }
      if (input.appearance && field.widget) {
        bakeWidgetAppearance(this.runtime, 
          candidate.docPtr,
          field.widget,
          input.appearance.pdf,
          input.appearance.pageIndex ?? 0,
        );
      }

      const store = this.storeFor();
      const saved = store.save(candidate.docPtr, valueObjNum, signingId);
      let sealed;
      try {
        sealed = store.seal(saved, algorithm);
      } catch (error) {
        store.discard(saved);
        throw error;
      }
      const prepared: SignaturePrepared = {
        signingId,
        digest: sealed.digest,
        algorithm,
        byteRange: sealed.byteRange,
        contentsSize,
        subFilter,
        expectedVersion,
        expiresAt: null,
      };
      this.session.pendingSigning = {
        prepared,
        fieldObjectNumber: field.fieldObjectNumber,
        saved,
        contentsOffset: sealed.contentsOffset,
        contentsHexLength: sealed.contentsHexLength,
      };
      return prepared;
    } finally {
      stack.close();
    }
  }

  complete(input: SignatureCompleteInput): SignatureCompleteResult {
    const pending = this.session.pendingSigning;
    if (!pending || pending.prepared.signingId !== input.signingId) {
      const last = this.session.lastCompletion;
      if (last && last.signingId === input.signingId) {
        if (!bytesEqual(last.cms, input.cms)) {
          throw new EngineError(
            EngineErrorCode.SignatureRefused,
            'this signing already completed with a different CMS',
          );
        }
        return { ...last.result, status: 'already-completed' };
      }
      throw new EngineError(EngineErrorCode.NotFound, `no pending signing '${input.signingId}'`);
    }
    if (!sameVersion(pending.prepared.expectedVersion, input.expectedVersion)) {
      throw new EngineError(
        EngineErrorCode.SigningVersionMismatch,
        'expectedVersion is not the version the candidate was prepared on',
      );
    }
    if (input.cms.byteLength === 0 || input.cms[0] !== 0x30) {
      throw new EngineError(EngineErrorCode.SignatureRefused, 'the CMS is not a DER SEQUENCE');
    }
    if (input.cms.byteLength > pending.prepared.contentsSize) {
      throw new EngineError(
        EngineErrorCode.SignatureRefused,
        `the CMS (${input.cms.byteLength} bytes) does not fit the reserved ${pending.prepared.contentsSize} bytes`,
      );
    }

    const store = this.storeFor();
    const sealed = {
      byteRange: pending.prepared.byteRange,
      contentsOffset: pending.contentsOffset,
      contentsHexLength: pending.contentsHexLength,
      digest: pending.prepared.digest,
    };
    store.writeContents(pending.saved, sealed, input.cms);
    const handle = store.openSealed(pending.saved, this.session.password);
    this.verifySealed(handle, {
      fieldObjectNumber: pending.fieldObjectNumber,
      byteRange: pending.prepared.byteRange,
      cms: input.cms,
    });

    // Install: the one place a live session changes its bytes.
    this.session.install(handle);
    disposeFormModel(this.runtime, this.session);
    disposeSignatureModel(this.runtime, this.session);

    const reader = new SignatureReader(this.runtime, this.session);
    const snapshot = reader.readSnapshot();
    const signature = snapshot.signatures.find(
      (s) =>
        s.field.kind === 'objectNumber' && s.field.fieldObjectNumber === pending.fieldObjectNumber,
    );
    if (!signature) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'the installed document lost the signature field',
      );
    }
    const result: SignatureCompleteResult = {
      status: 'completed',
      signature,
      version: reader.version(),
      previous: pending.prepared.expectedVersion,
      protection: snapshot.protection,
      meta: {
        affectedPages: this.session
          .allRecords()
          .map((r) => this.session.pageState(r.pageObjectNumber)),
        cacheDelta: null,
      },
    };
    this.session.lastCompletion = { signingId: input.signingId, cms: input.cms.slice(), result };
    return result;
  }

  abort(signingId: string): SignatureAbortResult {
    const pending = this.session.pendingSigning;
    if (pending && pending.prepared.signingId === signingId) {
      this.session.pendingSigning = null;
      this.storeFor().discard(pending.saved);
      return { status: 'aborted' };
    }
    if (this.session.lastCompletion?.signingId === signingId) {
      return { status: 'already-completed' };
    }
    return { status: 'unknown' };
  }

  // -------------------------------------------------------------------------

  private callPrepare(
    docPtr: Ptr,
    fieldObjectNumber: number,
    opts: {
      subfilter: number;
      digest: number;
      contentsSize: number;
      name: string | null;
      reason: string | null;
      location: string | null;
      contactInfo: string | null;
      signingTime: string | null;
      docmdpPermission: number;
      fieldmdpAction: number;
      fieldmdpFields: string[];
      lockPermission: number;
    },
  ): number {
    const { mem, fn } = this.runtime;
    const layout = this.runtime.kind === 'wasm' ? PREPARE_ILP32 : PREPARE_LP64;
    const owned: Ptr[] = [];
    const wide = (value: string | null): Ptr => {
      if (value === null) return NULL_PTR;
      const ptr = mem.writeU16String(value);
      owned.push(ptr);
      return ptr;
    };
    const utf8 = (value: string | null): Ptr => {
      if (value === null) return NULL_PTR;
      const ptr = mem.writeU8String(value);
      owned.push(ptr);
      return ptr;
    };
    try {
      return withWideStringArray(this.runtime, opts.fieldmdpFields, (fieldsPtr, fieldCount) =>
        withScratch(mem, layout.bytes, (structPtr) => {
          for (let off = 0; off < layout.bytes; off += 4) mem.poke(structPtr, 'i32', 0, off);
          const pokePtr = (offset: number, ptr: Ptr) => {
            if (layout.ptrBytes === 4) mem.poke(structPtr, 'i32', Number(ptr), offset);
            else mem.poke(structPtr, 'i64', ptr, offset);
          };
          mem.poke(structPtr, 'i32', opts.subfilter, layout.subfilter);
          mem.poke(structPtr, 'i32', opts.digest, layout.digest);
          // unsigned long: 4 bytes on ILP32, 8 on LP64 (low word first either way).
          mem.poke(structPtr, 'i32', opts.contentsSize, layout.contentsSize);
          pokePtr(layout.name, wide(opts.name));
          pokePtr(layout.reason, wide(opts.reason));
          pokePtr(layout.location, wide(opts.location));
          pokePtr(layout.contactInfo, wide(opts.contactInfo));
          pokePtr(layout.signingTime, utf8(opts.signingTime));
          mem.poke(structPtr, 'i32', opts.docmdpPermission, layout.docmdpPermission);
          mem.poke(structPtr, 'i32', opts.fieldmdpAction, layout.fieldmdpAction);
          pokePtr(layout.fieldmdpFields, fieldCount > 0 ? fieldsPtr : NULL_PTR);
          mem.poke(structPtr, 'i32', fieldCount, layout.fieldmdpFieldCount);
          mem.poke(structPtr, 'i32', opts.lockPermission, layout.lockPermission);
          return fn.EPDFSig_Prepare(docPtr, fieldObjectNumber, structPtr);
        }),
      );
    } finally {
      for (let i = owned.length - 1; i >= 0; i--) mem.free(owned[i]);
    }
  }

  /** Draw a page of `pdf` into the widget's appearance stream on the candidate. */

  /**
   * File-backed sessions (a file base in the registry: the server) persist
   * the candidate as a file beside the base; everything else keeps it in
   * memory. The choice follows the SESSION's base, not the candidate's.
   */
  private storeFor(): CandidateStore {
    const base = this.session.source.base;
    if (base?.kind === 'file') {
      return new FileCandidateStore(
        this.runtime,
        this.baseDocuments,
        base.path,
        this.candidatePath,
      );
    }
    return new MemoryCandidateStore(this.runtime, this.baseDocuments);
  }

  /**
   * Prove the sealed bytes carry a whole-revision signature on the field
   * before anything is installed; closes the handle on failure.
   */
  /**
   * Read the sealed candidate back before it is installed: the checks in
   * `assertSealedSignature` are made on a model loaded from the sealed
   * bytes themselves, so a candidate the writer got wrong never becomes
   * the session's bytes.
   */
  private verifySealed(handle: OpenedPdfDocument, expected: SealExpectation): void {
    const { fn } = this.runtime;
    try {
      const model = fn.EPDFSig_LoadModel(handle.docPtr);
      if (!model) {
        throw new EngineError(EngineErrorCode.Unknown, 'the sealed bytes have no signature model');
      }
      try {
        assertSealedSignature(this.runtime, handle.docPtr, model, expected);
      } finally {
        fn.EPDFSig_CloseModel(model);
      }
      if (this.session.kind !== 'layer') {
        this.session.persistLayerArtifact = false;
      }
    } catch (error) {
      handle.close();
      throw error;
    }
  }

  /**
   * The candidate the signature is authored on. A layer session reopens a
   * fresh layer over ITS OWN immutable base (a registry retain, no copy of
   * the file), fed the layer it was opened with — or, with unsaved edits,
   * the artifact a save would write, which is cumulative: the edits and
   * the signature then share one revision, as Acrobat saves a
   * fill-and-sign. The fallback freezes the complete loaded bytes as a new
   * memory base: for a plain session, and for a layer whose loaded delta
   * already holds signed bytes (a layer save rewrites the delta and would
   * drop them; the fork refuses to prepare such a candidate).
   */
  private openCandidate(signingId: string): OpenedPdfDocument {
    const password = this.session.password;
    const source = this.session.source;
    if (this.session.kind === 'layer' && source.base && !this.loadedDeltaHoldsSignedBytes()) {
      const base = this.baseDocuments.retainByKey(source.base.key);
      if (base) {
        const layer: LayerSource = this.session.hasUnsavedEdits()
          ? {
              kind: 'artifact',
              bytes: new DocumentSaver(this.runtime, this.session).saveLayerArtifact().bytes,
            }
          : (source.layer ?? { kind: 'fresh' });
        return openLayerDocument(this.runtime, base, layer, password);
      }
    }
    const candidateBytes = this.session.hasUnsavedEdits()
      ? new DocumentSaver(this.runtime, this.session).saveStandaloneToBuffer('incremental').bytes
      : new SignatureReader(this.runtime, this.session).loadedBytes();
    const base = this.baseDocuments.acquireMemoryBase({
      key: `candidate:${signingId}`,
      bytes: new Uint8Array(candidateBytes),
      password,
    });
    return openLayerDocument(this.runtime, base, { kind: 'fresh' }, password);
  }

  /** Whether a signature's byte range reaches into the layer's loaded delta (past the base). */
  private loadedDeltaHoldsSignedBytes(): boolean {
    const layer = this.session.source.layer;
    if (!layer || layer.kind === 'fresh') return false;
    const baseSize = Number(this.runtime.fn.EPDFDoc_GetBaseBytesSize(this.session.requireDocPtr()));
    const snapshot = new SignatureReader(this.runtime, this.session).readSnapshot();
    return snapshot.signatures.some(
      (s) => s.signed && s.byteRange !== null && s.byteRange[2] + s.byteRange[3] > baseSize,
    );
  }
}

function sameVersion(a: DocumentVersionRef, b: DocumentVersionRef): boolean {
  return a.baseSha256 === b.baseSha256 && a.editsVersion === b.editsVersion;
}
