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

import type { DocumentSession, PendingSigning } from '../../document-session/DocumentSession';
import type { BaseDocumentRegistry } from '../../document-session/lifecycle/BaseDocumentRegistry';
import {
  CloseStack,
  openLayerDocument,
  type OpenedPdfDocument,
} from '../../document-session/lifecycle/PdfDocumentOpener';
import { withScratch, withScratchN } from '../../runtime/memory/scratch';
import { generateUuid } from '../../shared/uuid';
import { DocumentSaver } from '../save/DocumentSaver';
import { disposeFormModel } from '../forms/internal/formModelCache';
import { withWideStringArray } from '../forms/internal/wideStringArray';
import { DIGEST_CODE, SignatureReader } from './SignatureReader';
import { disposeSignatureModel } from './internal/signatureModelCache';

// Mirrors public/epdf_signature.h.
const SUBFILTER_CODE = {
  'adbe.pkcs7.detached': 0,
  'ETSI.CAdES.detached': 1,
  'ETSI.RFC3161': 2,
} as const;
const FIELD_ACTION_CODE = { all: 1, include: 2, exclude: 3 } as const;
const COVERAGE_WHOLE_REVISION = 0;
const DEFAULT_CONTENTS_SIZE = 8192;
const MIN_CONTENTS_SIZE = 256;
const MAX_CONTENTS_SIZE = 4 * 1024 * 1024;
const U64_BYTES = 8;

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
 * fresh layer over the bytes the session would save (the loaded bytes
 * when nothing changed, an incremental save otherwise, so unsaved edits
 * become their own revision) — writes the signature there, saves it with
 * only the objects the signature touched, seals it, and parks the
 * sealed-to-be bytes on the session. `complete` writes the CMS into the
 * parked bytes, opens them the way the session was opened, proves the new
 * signature seals a whole revision, and installs them as the session's
 * document. `abort` drops the candidate.
 */
export class SignatureMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    private readonly baseDocuments: BaseDocumentRegistry,
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
      throw new EngineError(EngineErrorCode.SignatureRefused, 'the signature field is already signed');
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
      throw new EngineError(EngineErrorCode.SignatureRefused, `unsupported subFilter '${subFilter}'`);
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

    // The bytes the session would save, then a throwaway layer on top.
    const candidateBytes = this.session.hasUnsavedEdits()
      ? new DocumentSaver(this.runtime, this.session).saveStandaloneToBuffer('incremental').bytes
      : reader.loadedBytes();
    const signingId = generateUuid();
    const stack = new CloseStack();
    try {
      const base = this.baseDocuments.acquireMemoryBase({
        key: `candidate:${signingId}`,
        bytes: new Uint8Array(candidateBytes),
        password: this.session.password,
      });
      const candidate = openLayerDocument(this.runtime, base, { kind: 'fresh' }, this.session.password);
      stack.push(() => candidate.close());

      const valueObjNum = this.callPrepare(candidate.docPtr, field.fieldObjectNumber, {
        subfilter: SUBFILTER_CODE[subFilter],
        digest: DIGEST_CODE[algorithm],
        contentsSize,
        name: input.signer?.name ?? null,
        reason: input.signer?.reason ?? null,
        location: input.signer?.location ?? null,
        contactInfo: input.signer?.contactInfo ?? null,
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
        this.bakeAppearance(candidate.docPtr, field.widget, input.appearance.pdf, input.appearance.pageIndex ?? 0);
      }

      const saved = this.saveCandidate(candidate.docPtr, valueObjNum);
      const sealed = this.seal(saved, algorithm);
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
        buffer: saved.bytes,
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

    const sealed = this.writeContents(pending, input.cms);
    const handle = this.openSealed(sealed, pending.fieldObjectNumber);

    // Install: the one place a live session changes its bytes.
    this.session.install(handle);
    disposeFormModel(this.runtime, this.session);
    disposeSignatureModel(this.runtime, this.session);

    const reader = new SignatureReader(this.runtime, this.session);
    const snapshot = reader.readSnapshot();
    const signature = snapshot.signatures.find(
      (s) => s.field.kind === 'objectNumber' && s.field.fieldObjectNumber === pending.fieldObjectNumber,
    );
    if (!signature) {
      throw new EngineError(EngineErrorCode.Unknown, 'the installed document lost the signature field');
    }
    const result: SignatureCompleteResult = {
      status: 'completed',
      signature,
      version: reader.version(),
      previous: pending.prepared.expectedVersion,
      protection: snapshot.protection,
      meta: {
        affectedPages: this.session.allRecords().map((r) => this.session.pageState(r.pageObjectNumber)),
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
  private bakeAppearance(
    docPtr: Ptr,
    widget: { annotObjectNumber: number; pageObjectNumber: number },
    pdf: Uint8Array,
    pageIndex: number,
  ): void {
    const { mem, fn } = this.runtime;
    const stack = new CloseStack();
    try {
      const pagePtr = fn.EPDFDoc_LoadPageByObjectNumber(docPtr, widget.pageObjectNumber);
      if (!pagePtr) {
        throw new EngineError(EngineErrorCode.NotFound, 'the widget page could not be loaded');
      }
      stack.push(() => fn.FPDF_ClosePage(pagePtr));
      const annotPtr = fn.EPDFPage_GetAnnotByObjectNumber(pagePtr, widget.annotObjectNumber);
      if (!annotPtr) {
        throw new EngineError(EngineErrorCode.NotFound, 'the signature widget could not be loaded');
      }
      stack.push(() => fn.FPDFPage_CloseAnnot(annotPtr));
      const dataPtr = mem.alloc(pdf.byteLength);
      stack.push(() => mem.free(dataPtr));
      mem.writeBytes(dataPtr, pdf);
      const artworkPtr = fn.FPDF_LoadMemDocument64(dataPtr, pdf.byteLength, '');
      if (!artworkPtr) {
        throw new EngineError(EngineErrorCode.MalformedPdf, 'the appearance PDF could not be opened');
      }
      stack.push(() => fn.FPDF_CloseDocument(artworkPtr));
      if (!fn.EPDFAnnot_SetAppearanceFromPage(annotPtr, artworkPtr, pageIndex)) {
        throw new EngineError(EngineErrorCode.InvalidArg, 'the appearance page could not be drawn into the widget');
      }
    } finally {
      stack.close();
    }
  }

  private saveCandidate(
    docPtr: Ptr,
    valueObjNum: number,
  ): { bytes: Uint8Array; objectOffset: number; objectLength: number } {
    const { mem, fn } = this.runtime;
    return withScratchN(mem, [U64_BYTES, U64_BYTES, U64_BYTES], ([sizePtr, offPtr, lenPtr]) => {
      pokeU64(mem, sizePtr, 0);
      pokeU64(mem, offPtr, 0);
      pokeU64(mem, lenPtr, 0);
      const bufPtr = fn.EPDFSig_SaveCandidateToOwnedBuffer(docPtr, valueObjNum, sizePtr, offPtr, lenPtr);
      if (!bufPtr) {
        throw new EngineError(EngineErrorCode.Unknown, 'failed to save the signing candidate');
      }
      try {
        const size = peekU64(mem, sizePtr);
        return {
          bytes: copyOut(mem.readBytes(bufPtr, size)),
          objectOffset: peekU64(mem, offPtr),
          objectLength: peekU64(mem, lenPtr),
        };
      } finally {
        fn.EPDF_FreeBuffer(bufPtr);
      }
    });
  }

  private seal(
    saved: { bytes: Uint8Array; objectOffset: number; objectLength: number },
    algorithm: Exclude<DigestAlgorithm, 'sha1'>,
  ): {
    byteRange: [number, number, number, number];
    contentsOffset: number;
    contentsHexLength: number;
    digest: Uint8Array;
  } {
    const { mem, fn } = this.runtime;
    const bufPtr = mem.alloc(saved.bytes.byteLength);
    try {
      mem.writeBytes(bufPtr, saved.bytes);
      return withScratchN(
        mem,
        [4 * U64_BYTES, U64_BYTES, U64_BYTES, 64, U64_BYTES],
        ([rangePtr, coPtr, chPtr, digestPtr, lenPtr]) => {
          for (let k = 0; k < 4; k++) pokeU64(mem, rangePtr, 0, k * U64_BYTES);
          pokeU64(mem, coPtr, 0);
          pokeU64(mem, chPtr, 0);
          pokeU64(mem, lenPtr, 64);
          const ok = fn.EPDFSig_Seal(
            bufPtr,
            BigInt(saved.bytes.byteLength),
            BigInt(saved.objectOffset),
            BigInt(saved.objectLength),
            DIGEST_CODE[algorithm],
            rangePtr,
            coPtr,
            chPtr,
            digestPtr,
            lenPtr,
          );
          if (!ok) {
            throw new EngineError(EngineErrorCode.Unknown, 'failed to seal the signing candidate');
          }
          // The seal patched /ByteRange in place: keep the patched bytes.
          saved.bytes = copyOut(mem.readBytes(bufPtr, saved.bytes.byteLength));
          const digestLength = Number(mem.peek(lenPtr, 'i32'));
          return {
            byteRange: [
              peekU64(mem, rangePtr, 0),
              peekU64(mem, rangePtr, U64_BYTES),
              peekU64(mem, rangePtr, 2 * U64_BYTES),
              peekU64(mem, rangePtr, 3 * U64_BYTES),
            ],
            contentsOffset: peekU64(mem, coPtr),
            contentsHexLength: peekU64(mem, chPtr),
            digest: copyOut(mem.readBytes(digestPtr, digestLength)),
          };
        },
      );
    } finally {
      mem.free(bufPtr);
    }
  }

  private writeContents(pending: PendingSigning, cms: Uint8Array): Uint8Array {
    const { mem, fn } = this.runtime;
    const bufPtr = mem.alloc(pending.buffer.byteLength);
    const cmsPtr = mem.alloc(cms.byteLength);
    try {
      mem.writeBytes(bufPtr, pending.buffer);
      mem.writeBytes(cmsPtr, cms);
      const ok = fn.EPDFSig_WriteContents(
        bufPtr,
        BigInt(pending.buffer.byteLength),
        BigInt(pending.contentsOffset),
        BigInt(pending.contentsHexLength),
        cmsPtr,
        cms.byteLength,
      );
      if (!ok) {
        throw new EngineError(
          EngineErrorCode.SignatureRefused,
          'the CMS is not one DER object that fits the reserved /Contents',
        );
      }
      return copyOut(mem.readBytes(bufPtr, pending.buffer.byteLength));
    } finally {
      mem.free(cmsPtr);
      mem.free(bufPtr);
    }
  }

  /**
   * Open the sealed bytes as a new immutable base with a fresh layer on
   * top — whatever kind the session was — and prove the new signature
   * seals a whole revision before anything is installed. A signed document
   * is always edited on a layer: a later save then appends only the
   * objects that changed, never a rewrite of the signature dictionary,
   * which strict validators reject as an illegitimate modification.
   */
  private openSealed(sealed: Uint8Array, fieldObjectNumber: number): OpenedPdfDocument {
    const { fn } = this.runtime;
    const password = this.session.password;
    const base = this.baseDocuments.acquireMemoryBase({
      key: `signed:${generateUuid()}`,
      bytes: sealed,
      password,
    });
    const handle = openLayerDocument(this.runtime, base, { kind: 'fresh' }, password);
    if (this.session.kind !== 'layer') {
      this.session.persistLayerArtifact = false;
    }
    try {
      const model = fn.EPDFSig_LoadModel(handle.docPtr);
      if (!model) {
        throw new EngineError(EngineErrorCode.Unknown, 'the sealed bytes have no signature model');
      }
      try {
        const index = fn.EPDFSig_GetIndexByFieldObjNum(model, fieldObjectNumber);
        if (
          index < 0 ||
          !fn.EPDFSig_IsSigned(model, index) ||
          fn.EPDFSig_GetCoverage(model, index) !== COVERAGE_WHOLE_REVISION
        ) {
          throw new EngineError(
            EngineErrorCode.SignatureRefused,
            'the sealed bytes do not carry a whole-revision signature on the field',
          );
        }
      } finally {
        fn.EPDFSig_CloseModel(model);
      }
      return handle;
    } catch (error) {
      handle.close();
      throw error;
    }
  }
}

function sameVersion(a: DocumentVersionRef, b: DocumentVersionRef): boolean {
  return a.baseSha256 === b.baseSha256 && a.editsVersion === b.editsVersion;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

function copyOut(view: Uint8Array): Uint8Array {
  const out = new Uint8Array(view.byteLength);
  out.set(view);
  return out;
}

function pokeU64(mem: PdfRuntimeModule['mem'], ptr: Ptr, value: number, byteOffset = 0): void {
  const big = BigInt(value);
  mem.poke(ptr, 'i32', Number(big & 0xffffffffn) | 0, byteOffset);
  mem.poke(ptr, 'i32', Number((big >> 32n) & 0xffffffffn) | 0, byteOffset + 4);
}

function peekU64(mem: PdfRuntimeModule['mem'], ptr: Ptr, byteOffset = 0): number {
  const lo = Number(mem.peek(ptr, 'i32', byteOffset)) >>> 0;
  const hi = Number(mem.peek(ptr, 'i32', byteOffset + 4)) >>> 0;
  return hi * 0x100000000 + lo;
}
