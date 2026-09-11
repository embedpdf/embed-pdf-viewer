import type {
  BaseVersionInfo,
  DigestAlgorithm,
  DocMdpPermission,
  DocumentProtection,
  FieldLockSpec,
  FormFieldRef,
  PdfRevision,
  SignatureCoverage,
  SignatureDTO,
  SignatureSeedValue,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, deriveProtection } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfRuntimeModule, type Ptr } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratch, withScratchN } from '../../runtime/memory/scratch';
import { readUtf16String } from '../../runtime/memory/strings';
import { acquireSignatureModel } from './internal/signatureModelCache';

// Mirrors public/epdf_signature.h.
const KIND_DOC_TIMESTAMP = 1;
const COVERAGE_BY_CODE: Record<number, SignatureCoverage> = {
  0: 'whole-revision',
  1: 'partial',
  2: 'malformed',
};
const STRING_FILTER = 0;
const STRING_SUBFILTER = 1;
const STRING_NAME = 2;
const STRING_REASON = 3;
const STRING_LOCATION = 4;
const STRING_CONTACT_INFO = 5;
const STRING_M = 6;
const FIELD_ACTION_BY_CODE: Record<number, FieldLockSpec['action']> = {
  1: 'all',
  2: 'include',
  3: 'exclude',
};
const FIELDS_FIELDMDP = 0;
const FIELDS_LOCK = 1;
const SV_V = 1 << 2;
const SV_LEGAL_ATTESTATION = 1 << 4;
const SV_ADD_REV_INFO = 1 << 5;
const SV_LOCK_DOCUMENT = 1 << 7;
const SV_APPEARANCE_FILTER = 1 << 8;
const SV_MDP = 1 << 17;
const SV_LIST_SUBFILTER = 0;
const SV_LIST_DIGEST_METHOD = 1;
const SV_LIST_REASONS = 2;
/** The PDF 1.7 seed-value entry set this engine implements. */
const SUPPORTED_SEED_VALUE_VERSION = 2;
const SV_UNSUPPORTED_REQUIRED =
  SV_LEGAL_ATTESTATION | SV_ADD_REV_INFO | SV_LOCK_DOCUMENT | SV_APPEARANCE_FILTER;

export const DIGEST_CODE: Record<DigestAlgorithm, number> = {
  sha1: 0,
  sha256: 1,
  sha384: 2,
  sha512: 3,
};
const DIGEST_LENGTH: Record<DigestAlgorithm, number> = {
  sha1: 20,
  sha256: 32,
  sha384: 48,
  sha512: 64,
};
const U64_BYTES = 8;

/**
 * Reads the signature model of a session: revisions, every signature
 * field with its signed state, and the protection those signatures
 * impose. Byte facts (revisions, coverage, digests, loaded bytes) come
 * from the bytes the document was loaded from — for a layer session the
 * base plus the delta it was opened with — never from unsaved edits.
 */
export class SignatureReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  readSnapshot(): SignatureSnapshot {
    const model = acquireSignatureModel(this.runtime, this.session);
    const chainValid = this.runtime.fn.EPDFSig_IsRevisionChainValid(model);
    const signatures = this.readSignatures(model);
    const revisions = chainValid ? this.readRevisions(signatures) : [];
    return { chainValid, revisions, signatures, protection: deriveProtection(signatures) };
  }

  /** The protection alone, for the open probe and the form write guard. */
  readProtection(): DocumentProtection {
    const model = acquireSignatureModel(this.runtime, this.session);
    return deriveProtection(this.readSignatures(model));
  }

  /** The DER `/Contents` of a signed field, padding stripped. */
  readContents(ref: FormFieldRef): ArrayBuffer {
    const { fn, mem } = this.runtime;
    const model = acquireSignatureModel(this.runtime, this.session);
    const index = this.requireSignedIndex(model, ref);
    const length = fn.EPDFSig_GetContents(model, index, NULL_PTR, 0);
    if (length <= 0) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        'signature has no usable /Contents (malformed encoding)',
      );
    }
    return withScratch(mem, length, (buf) => {
      const written = fn.EPDFSig_GetContents(model, index, buf, length);
      if (written !== length) {
        throw new EngineError(EngineErrorCode.Unknown, 'failed to read signature contents');
      }
      return copyOut(mem.readBytes(buf, length));
    });
  }

  /** Hash a signed field's `/ByteRange` straight from the loaded bytes. */
  digest(ref: FormFieldRef, algorithm: DigestAlgorithm): ArrayBuffer {
    const model = acquireSignatureModel(this.runtime, this.session);
    const index = this.requireSignedIndex(model, ref);
    const range = this.readByteRange(model, index);
    if (!range) {
      throw new EngineError(EngineErrorCode.NotFound, 'signature has no usable /ByteRange');
    }
    return this.digestRange(range, algorithm);
  }

  /** The exact bytes of one revision. */
  revisionBytes(revisionIndex: number): ArrayBuffer {
    const snapshot = this.readSnapshot();
    if (!snapshot.chainValid) {
      throw new EngineError(EngineErrorCode.MalformedPdf, 'revision chain is not valid');
    }
    const revision = snapshot.revisions[revisionIndex];
    if (!revision) {
      throw new EngineError(EngineErrorCode.NotFound, `no revision ${revisionIndex}`);
    }
    return this.readLoadedBytes(0, revision.end);
  }

  /** Resolve a signature-field ref to its identity in the current model. */
  resolveField(ref: FormFieldRef): {
    index: number;
    fieldObjectNumber: number;
    signed: boolean;
    widget: { annotObjectNumber: number; pageObjectNumber: number } | null;
  } {
    const { fn } = this.runtime;
    const model = acquireSignatureModel(this.runtime, this.session);
    const index = this.indexOf(model, ref);
    if (index < 0) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        ref.kind === 'objectNumber'
          ? `signature field not found: object ${ref.fieldObjectNumber}`
          : `signature field not found: "${ref.name}"`,
      );
    }
    const widgetObjNum = fn.EPDFSig_GetWidgetObjNum(model, index);
    return {
      index,
      fieldObjectNumber: fn.EPDFSig_GetFieldObjNum(model, index),
      signed: fn.EPDFSig_IsSigned(model, index),
      widget:
        widgetObjNum > 0
          ? {
              annotObjectNumber: widgetObjNum,
              pageObjectNumber: fn.EPDFSig_GetWidgetPageObjNum(model, index),
            }
          : null,
    };
  }

  /** One signature by field object number, from the current model. */
  readSignatureByObjectNumber(fieldObjectNumber: number): SignatureDTO {
    const snapshot = this.readSnapshot();
    const found = snapshot.signatures.find(
      (s) => s.field.kind === 'objectNumber' && s.field.fieldObjectNumber === fieldObjectNumber,
    );
    if (!found) {
      throw new EngineError(EngineErrorCode.NotFound, `signature field not found: object ${fieldObjectNumber}`);
    }
    return found;
  }

  /** The complete loaded bytes (a plain file, or a layer's base + delta). */
  loadedBytes(): ArrayBuffer {
    const size = Number(this.runtime.fn.EPDFDoc_GetLoadedBytesSize(this.session.requireDocPtr()));
    return this.readLoadedBytes(0, size);
  }

  /**
   * SHA-256 and length of the base the session is on. A layer session
   * reports its base's hash (supplied by the host or computed once by the
   * runtime); a plain session hashes its loaded bytes once per load.
   */
  version(): BaseVersionInfo {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const byteLength = Number(fn.EPDFDoc_GetBaseBytesSize(docPtr));
    if (byteLength <= 0) {
      throw new EngineError(EngineErrorCode.DocNotOpen, 'document has no loaded bytes');
    }
    if (this.session.kind === 'layer') {
      const sha256 = withScratch(mem, 32, (out) => {
        if (!fn.EPDFLayer_GetBaseSha256(docPtr, out)) {
          throw new EngineError(EngineErrorCode.Unknown, 'failed to read the base hash');
        }
        return toHex(mem.readBytes(out, 32));
      });
      return { sha256, byteLength };
    }
    const cached = this.session.cachedPlainSha256();
    if (cached) return { sha256: cached, byteLength };
    const digest = new Uint8Array(this.digestRange([0, byteLength, byteLength, 0], 'sha256'));
    const sha256 = toHex(digest);
    this.session.rememberPlainSha256(sha256);
    return { sha256, byteLength };
  }

  // -------------------------------------------------------------------------

  private readRevisions(signatures: SignatureDTO[]): PdfRevision[] {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const count = fn.EPDFDoc_GetRevisionCount(docPtr);
    const revisions: PdfRevision[] = [];
    if (count <= 0) return revisions;
    withScratchN(mem, [U64_BYTES, U64_BYTES], ([endPtr, xrefPtr]) => {
      for (let i = 0; i < count; i++) {
        pokeU64(mem, endPtr, 0);
        pokeU64(mem, xrefPtr, 0);
        if (!fn.EPDFDoc_GetRevision(docPtr, i, endPtr, xrefPtr)) {
          throw new EngineError(EngineErrorCode.Unknown, `failed to read revision ${i}`);
        }
        const sealedBy = signatures.find((s) => s.revisionIndex === i);
        revisions.push({
          index: i,
          end: peekU64(mem, endPtr),
          xrefOffset: peekU64(mem, xrefPtr),
          signatureIndex: sealedBy ? sealedBy.index : null,
        });
      }
    });
    return revisions;
  }

  private readSignatures(model: Ptr): SignatureDTO[] {
    const { fn } = this.runtime;
    const count = fn.EPDFSig_Count(model);
    const out: SignatureDTO[] = [];
    for (let i = 0; i < count; i++) {
      const signed = fn.EPDFSig_IsSigned(model, i);
      const widgetObjNum = fn.EPDFSig_GetWidgetObjNum(model, i);
      const revisionIndex = fn.EPDFSig_GetRevisionIndex(model, i);
      const docMdp = fn.EPDFSig_GetDocMDPPermission(model, i);
      out.push({
        index: i,
        field: { kind: 'objectNumber', fieldObjectNumber: fn.EPDFSig_GetFieldObjNum(model, i) },
        fieldName: this.readWide((buf, cap) => fn.EPDFSig_GetFieldName(model, i, buf, cap)) ?? '',
        widget:
          widgetObjNum > 0
            ? {
                annotObjectNumber: widgetObjNum,
                pageObjectNumber: fn.EPDFSig_GetWidgetPageObjNum(model, i),
              }
            : null,
        signed,
        kind: fn.EPDFSig_GetKind(model, i) === KIND_DOC_TIMESTAMP ? 'timestamp' : 'signature',
        filter: this.readString(model, i, STRING_FILTER),
        subFilter: this.readString(model, i, STRING_SUBFILTER),
        byteRange: signed ? this.readByteRange(model, i) : null,
        contentsSize: signed ? Math.max(0, fn.EPDFSig_GetContents(model, i, NULL_PTR, 0)) : 0,
        coverage: signed ? (COVERAGE_BY_CODE[fn.EPDFSig_GetCoverage(model, i)] ?? 'malformed') : null,
        revisionIndex: signed && revisionIndex >= 0 ? revisionIndex : null,
        signer: {
          name: this.readString(model, i, STRING_NAME),
          reason: this.readString(model, i, STRING_REASON),
          location: this.readString(model, i, STRING_LOCATION),
          contactInfo: this.readString(model, i, STRING_CONTACT_INFO),
          claimedTime: this.readString(model, i, STRING_M),
        },
        docMdp: isPermission(docMdp) ? docMdp : null,
        catalogCertification: fn.EPDFSig_IsCatalogCertification(model, i),
        fieldMdp: this.readLock(model, i, FIELDS_FIELDMDP),
        lock: this.readLock(model, i, FIELDS_LOCK),
        seedValue: this.readSeedValue(model, i),
      });
    }
    return out;
  }

  private readLock(model: Ptr, index: number, which: number): FieldLockSpec | null {
    const { fn } = this.runtime;
    const code =
      which === FIELDS_LOCK
        ? fn.EPDFSig_GetLockAction(model, index)
        : fn.EPDFSig_GetFieldMDPAction(model, index);
    const action = FIELD_ACTION_BY_CODE[code];
    if (!action) return null;
    const fields: string[] = [];
    const count = fn.EPDFSig_GetFieldNameCount(model, index, which);
    for (let n = 0; n < count; n++) {
      fields.push(
        this.readWide((buf, cap) => fn.EPDFSig_GetFieldNameAt(model, index, which, n, buf, cap)) ??
          '',
      );
    }
    const spec: FieldLockSpec = { action, fields };
    if (which === FIELDS_LOCK) {
      const permission = fn.EPDFSig_GetLockPermission(model, index);
      if (isPermission(permission)) spec.permission = permission;
    }
    return spec;
  }

  private readSeedValue(model: Ptr, index: number): SignatureSeedValue | null {
    const { fn } = this.runtime;
    if (!fn.EPDFSig_HasSeedValue(model, index)) return null;
    const requiredFlags = fn.EPDFSig_GetSeedValueRequiredFlags(model, index) >>> 0;
    const presentFlags = fn.EPDFSig_GetSeedValuePresentFlags(model, index) >>> 0;
    const version = fn.EPDFSig_GetSeedValueVersion(model, index);
    const mdp = fn.EPDFSig_GetSeedValueMDP(model, index);
    const list = (which: number): string[] => {
      const count = fn.EPDFSig_GetSeedValueListCount(model, index, which);
      const items: string[] = [];
      for (let n = 0; n < count; n++) {
        items.push(
          this.readWide((buf, cap) =>
            fn.EPDFSig_GetSeedValueListAt(model, index, which, n, buf, cap),
          ) ?? '',
        );
      }
      return items;
    };
    const unsupportedRequired =
      (requiredFlags & SV_UNSUPPORTED_REQUIRED) !== 0 ||
      ((requiredFlags & SV_V) !== 0 && version > SUPPORTED_SEED_VALUE_VERSION);
    return {
      requiredFlags,
      presentFlags,
      version: version > 0 ? version : null,
      mdp: (presentFlags & SV_MDP) !== 0 && mdp >= 0 && mdp <= 3 ? (mdp as 0 | 1 | 2 | 3) : null,
      filter: this.readWide((buf, cap) => fn.EPDFSig_GetSeedValueFilter(model, index, buf, cap)),
      subFilters: list(SV_LIST_SUBFILTER),
      digestMethods: list(SV_LIST_DIGEST_METHOD),
      reasons: list(SV_LIST_REASONS),
      unsupportedRequired,
    };
  }

  private readByteRange(model: Ptr, index: number): [number, number, number, number] | null {
    const { fn, mem } = this.runtime;
    return withScratch(mem, 4 * U64_BYTES, (ptr) => {
      for (let k = 0; k < 4; k++) pokeU64(mem, ptr, 0, k * U64_BYTES);
      if (!fn.EPDFSig_GetByteRange(model, index, ptr)) return null;
      return [
        peekU64(mem, ptr, 0),
        peekU64(mem, ptr, U64_BYTES),
        peekU64(mem, ptr, 2 * U64_BYTES),
        peekU64(mem, ptr, 3 * U64_BYTES),
      ];
    });
  }

  private digestRange(range: [number, number, number, number], algorithm: DigestAlgorithm): ArrayBuffer {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const outLength = DIGEST_LENGTH[algorithm];
    return withScratchN(mem, [4 * U64_BYTES, outLength, U64_BYTES], ([rangePtr, outPtr, lenPtr]) => {
      for (let k = 0; k < 4; k++) pokeU64(mem, rangePtr, range[k], k * U64_BYTES);
      // `unsigned long*`: 4 bytes on wasm32, 8 on native — write the whole
      // 8-byte slot so either width reads the capacity.
      pokeU64(mem, lenPtr, outLength);
      const ok = fn.EPDFSig_DigestByteRange(docPtr, rangePtr, DIGEST_CODE[algorithm], outPtr, lenPtr);
      if (!ok) {
        throw new EngineError(EngineErrorCode.InvalidArg, 'byte range is not within the loaded bytes');
      }
      const written = Number(mem.peek(lenPtr, 'i32'));
      return copyOut(mem.readBytes(outPtr, written));
    });
  }

  private readLoadedBytes(offset: number, length: number): ArrayBuffer {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    if (length === 0) return new ArrayBuffer(0);
    return withScratch(mem, length, (ptr) => {
      const read = fn.EPDFDoc_ReadLoadedBytes(docPtr, BigInt(offset), ptr, length);
      if (read !== length) {
        throw new EngineError(EngineErrorCode.Unknown, 'failed to read the loaded bytes');
      }
      return copyOut(mem.readBytes(ptr, length));
    });
  }

  private indexOf(model: Ptr, ref: FormFieldRef): number {
    const { fn } = this.runtime;
    if (ref.kind === 'objectNumber') {
      return fn.EPDFSig_GetIndexByFieldObjNum(model, ref.fieldObjectNumber);
    }
    const count = fn.EPDFSig_Count(model);
    for (let i = 0; i < count; i++) {
      const name = this.readWide((buf, cap) => fn.EPDFSig_GetFieldName(model, i, buf, cap));
      if (name === ref.name) return i;
    }
    return -1;
  }

  private requireSignedIndex(model: Ptr, ref: FormFieldRef): number {
    const { fn } = this.runtime;
    const index = this.indexOf(model, ref);
    if (index < 0) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        ref.kind === 'objectNumber'
          ? `signature field not found: object ${ref.fieldObjectNumber}`
          : `signature field not found: "${ref.name}"`,
      );
    }
    if (!fn.EPDFSig_IsSigned(model, index)) {
      throw new EngineError(EngineErrorCode.NotFound, 'signature field is not signed');
    }
    return index;
  }

  private readString(model: Ptr, index: number, key: number): string | null {
    return this.readWide((buf, cap) => this.runtime.fn.EPDFSig_GetString(model, index, key, buf, cap));
  }

  private readWide(call: (buf: Ptr, capacity: number) => number): string | null {
    return readUtf16String(this.runtime.mem, call, '');
  }
}

/**
 * 64-bit out-params as two little-endian 32-bit halves: the wasm memory
 * helpers have no 64-bit accessors (Emscripten's `setValue(i64)` needs
 * WASM_BIGINT), and the native runtime reads the same layout.
 */
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

function isPermission(value: number): value is DocMdpPermission {
  return value === 1 || value === 2 || value === 3;
}

function copyOut(view: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(view.byteLength);
  new Uint8Array(buffer).set(view);
  return buffer;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}
