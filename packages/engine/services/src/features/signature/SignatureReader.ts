import type {
  BaseVersionInfo,
  DigestAlgorithm,
  DocumentProtection,
  FormFieldRef,
  FormWidget,
  SignatureDTO,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';
import { formWidget } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, deriveProtection } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import {
  readByteRange,
  readRevisions,
  readSignaturesFromModel,
  readContentsAt,
} from './internal/readSignatureModel';
import { acquireSignatureModel } from './internal/signatureModelCache';
import { widgetPageRef } from '../forms/internal/readFormSnapshot';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratch, withScratchN } from '../../runtime/memory/scratch';
import { readUtf16String } from '../../runtime/memory/strings';
import { U64_BYTES, pokeU64 } from '../../runtime/memory/u64';

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
    const signatures = readSignaturesFromModel(this.runtime, model);
    const revisions = chainValid
      ? readRevisions(this.runtime, this.session.requireDocPtr(), signatures)
      : [];
    return { chainValid, revisions, signatures, protection: deriveProtection(signatures) };
  }

  /** The protection alone, for the open probe and the form write guard. */
  readProtection(): DocumentProtection {
    const model = acquireSignatureModel(this.runtime, this.session);
    return deriveProtection(readSignaturesFromModel(this.runtime, model));
  }

  /** The DER `/Contents` of a signed field, padding stripped. */
  readContents(ref: FormFieldRef): ArrayBuffer {
    const model = acquireSignatureModel(this.runtime, this.session);
    const index = this.requireSignedIndex(model, ref);
    return readContentsAt(this.runtime, model, index).buffer as ArrayBuffer;
  }

  /** Hash a signed field's `/ByteRange` straight from the loaded bytes. */
  digest(ref: FormFieldRef, algorithm: DigestAlgorithm): ArrayBuffer {
    const model = acquireSignatureModel(this.runtime, this.session);
    const index = this.requireSignedIndex(model, ref);
    const range = readByteRange(this.runtime, model, index);
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
    widget: FormWidget | null;
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
          ? formWidget(widgetObjNum, widgetPageRef(fn.EPDFSig_GetWidgetPageObjNum(model, index)))
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
      throw new EngineError(
        EngineErrorCode.NotFound,
        `signature field not found: object ${fieldObjectNumber}`,
      );
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

  private digestRange(
    range: [number, number, number, number],
    algorithm: DigestAlgorithm,
  ): ArrayBuffer {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const outLength = DIGEST_LENGTH[algorithm];
    return withScratchN(
      mem,
      [4 * U64_BYTES, outLength, U64_BYTES],
      ([rangePtr, outPtr, lenPtr]) => {
        for (let k = 0; k < 4; k++) pokeU64(mem, rangePtr, range[k], k * U64_BYTES);
        // `unsigned long*`: 4 bytes on wasm32, 8 on native — write the whole
        // 8-byte slot so either width reads the capacity.
        pokeU64(mem, lenPtr, outLength);
        const ok = fn.EPDFSig_DigestByteRange(
          docPtr,
          rangePtr,
          DIGEST_CODE[algorithm],
          outPtr,
          lenPtr,
        );
        if (!ok) {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            'byte range is not within the loaded bytes',
          );
        }
        const written = Number(mem.peek(lenPtr, 'i32'));
        return copyOut(mem.readBytes(outPtr, written));
      },
    );
  }

  /** `[offset, offset + length)` of the loaded bytes (base + loaded delta for a layer), copied out. */
  readLoadedBytes(offset: number, length: number): ArrayBuffer {
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
    return this.readWide((buf, cap) =>
      this.runtime.fn.EPDFSig_GetString(model, index, key, buf, cap),
    );
  }

  private readWide(call: (buf: Ptr, capacity: number) => number): string | null {
    return readUtf16String(this.runtime.mem, call, '');
  }
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
