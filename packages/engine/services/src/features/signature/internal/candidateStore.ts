import type { DigestAlgorithm } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { SavedCandidate } from '../../../document-session/DocumentSession';
import type { BaseDocumentRegistry } from '../../../document-session/lifecycle/BaseDocumentRegistry';
import {
  openLayerDocument,
  type OpenedPdfDocument,
} from '../../../document-session/lifecycle/PdfDocumentOpener';
import { withScratchN } from '../../../runtime/memory/scratch';
import { U64_BYTES, peekU64, pokeU64 } from '../../../runtime/memory/u64';
import { generateUuid } from '../../../shared/uuid';
import { DIGEST_CODE } from '../SignatureReader';

export interface SealedCandidate {
  byteRange: [number, number, number, number];
  contentsOffset: number;
  contentsHexLength: number;
  digest: Uint8Array;
}

/**
 * Where a signing candidate is persisted between `prepare` and
 * `complete`, and how its bytes are sealed and installed. The signing
 * orchestration is the same for both stores; only the byte operations
 * differ. `memory` holds the candidate as one buffer (the local engine).
 * `file` writes it next to the session's base file and never holds more
 * than the signature object's span in memory (the server).
 */
export interface CandidateStore {
  /** Serialise the candidate; the signature value object's span is reported. */
  save(candidateDocPtr: Ptr, sigObjNum: number, signingId: string): SavedCandidate;
  /** Patch /ByteRange in place and hash the two ranges. */
  seal(saved: SavedCandidate, algorithm: Exclude<DigestAlgorithm, 'sha1'>): SealedCandidate;
  /** Hex-encode the CMS into the /Contents placeholder, in place. */
  writeContents(saved: SavedCandidate, sealed: SealedCandidate, cms: Uint8Array): void;
  /** The sealed bytes as a new immutable base with a fresh layer on top. */
  openSealed(saved: SavedCandidate, password: string | null): OpenedPdfDocument;
  /** Forget a candidate that will never complete. */
  discard(saved: SavedCandidate): void;
}

function copyOut(view: Uint8Array): Uint8Array {
  const out = new Uint8Array(view.byteLength);
  out.set(view);
  return out;
}

/** Marshal `EPDFSig_SealSpan` over a span held in the runtime heap. */
function sealSpanInHeap(
  runtime: PdfRuntimeModule,
  spanPtr: Ptr,
  spanLength: number,
  objectOffset: number,
  fileLength: number,
): Omit<SealedCandidate, 'digest'> {
  const { fn, mem } = runtime;
  return withScratchN(mem, [4 * U64_BYTES, U64_BYTES, U64_BYTES], ([rangePtr, coPtr, chPtr]) => {
    for (let k = 0; k < 4; k++) pokeU64(mem, rangePtr, 0, k * U64_BYTES);
    pokeU64(mem, coPtr, 0);
    pokeU64(mem, chPtr, 0);
    const ok = fn.EPDFSig_SealSpan(
      spanPtr,
      BigInt(spanLength),
      BigInt(objectOffset),
      BigInt(fileLength),
      rangePtr,
      coPtr,
      chPtr,
    );
    if (!ok) {
      throw new EngineError(EngineErrorCode.Unknown, 'failed to seal the signing candidate');
    }
    return {
      byteRange: [
        peekU64(mem, rangePtr, 0),
        peekU64(mem, rangePtr, U64_BYTES),
        peekU64(mem, rangePtr, 2 * U64_BYTES),
        peekU64(mem, rangePtr, 3 * U64_BYTES),
      ],
      contentsOffset: peekU64(mem, coPtr),
      contentsHexLength: peekU64(mem, chPtr),
    };
  });
}

/** Marshal `EPDFSig_WriteContents` over a buffer in the heap whose first byte is file offset `bufferOffset`. */
function writeContentsInHeap(
  runtime: PdfRuntimeModule,
  bufPtr: Ptr,
  bufferLength: number,
  bufferOffset: number,
  sealed: SealedCandidate,
  cms: Uint8Array,
): void {
  const { fn, mem } = runtime;
  const cmsPtr = mem.alloc(cms.byteLength);
  try {
    mem.writeBytes(cmsPtr, cms);
    const ok = fn.EPDFSig_WriteContents(
      bufPtr,
      BigInt(bufferLength),
      BigInt(sealed.contentsOffset - bufferOffset),
      BigInt(sealed.contentsHexLength),
      cmsPtr,
      cms.byteLength,
    );
    if (!ok) {
      throw new EngineError(
        EngineErrorCode.SignatureRefused,
        'the CMS is not one DER object that fits the reserved /Contents',
      );
    }
  } finally {
    mem.free(cmsPtr);
  }
}

/**
 * Hex-encode `cms` into the /Contents hole of a candidate FILE, in place.
 * Only the hole (`<`, the hex digits, `>`) is read and written back; the
 * delimiters are checked so a wrong offset patches nothing.
 */
export function writeContentsIntoFile(
  runtime: PdfRuntimeModule,
  path: string,
  hole: { holeOffset: number; hexLength: number },
  cms: Uint8Array,
): void {
  const { mem } = runtime;
  const span = runtime.fileAccess.readRange(path, hole.holeOffset, hole.hexLength + 2);
  if (
    span.byteLength !== hole.hexLength + 2 ||
    span[0] !== 0x3c ||
    span[span.byteLength - 1] !== 0x3e
  ) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'the byteRange gap is not a <…> /Contents hole of the candidate',
    );
  }
  const spanPtr = mem.alloc(span.byteLength);
  try {
    mem.writeBytes(spanPtr, span);
    writeContentsInHeap(
      runtime,
      spanPtr,
      span.byteLength,
      hole.holeOffset,
      {
        byteRange: [0, 0, 0, 0],
        contentsOffset: hole.holeOffset + 1,
        contentsHexLength: hole.hexLength,
        digest: new Uint8Array(),
      },
      cms,
    );
    runtime.fileWrite.writeRange(path, hole.holeOffset, mem.readBytes(spanPtr, span.byteLength));
  } finally {
    mem.free(spanPtr);
  }
}

// ---------------------------------------------------------------------------

export class MemoryCandidateStore implements CandidateStore {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly baseDocuments: BaseDocumentRegistry,
  ) {}

  save(candidateDocPtr: Ptr, sigObjNum: number): SavedCandidate {
    const { mem, fn } = this.runtime;
    return withScratchN(mem, [U64_BYTES, U64_BYTES, U64_BYTES], ([sizePtr, offPtr, lenPtr]) => {
      pokeU64(mem, sizePtr, 0);
      pokeU64(mem, offPtr, 0);
      pokeU64(mem, lenPtr, 0);
      const bufPtr = fn.EPDFSig_SaveCandidateToOwnedBuffer(
        candidateDocPtr,
        sigObjNum,
        sizePtr,
        offPtr,
        lenPtr,
      );
      if (!bufPtr) {
        throw new EngineError(EngineErrorCode.Unknown, 'failed to save the signing candidate');
      }
      try {
        const size = peekU64(mem, sizePtr);
        return {
          kind: 'memory',
          bytes: copyOut(mem.readBytes(bufPtr, size)),
          size,
          objectOffset: peekU64(mem, offPtr),
          objectLength: peekU64(mem, lenPtr),
        };
      } finally {
        fn.EPDF_FreeBuffer(bufPtr);
      }
    });
  }

  seal(saved: SavedCandidate, algorithm: Exclude<DigestAlgorithm, 'sha1'>): SealedCandidate {
    if (saved.kind !== 'memory')
      throw new EngineError(EngineErrorCode.InvalidArg, 'not a memory candidate');
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

  writeContents(saved: SavedCandidate, sealed: SealedCandidate, cms: Uint8Array): void {
    if (saved.kind !== 'memory')
      throw new EngineError(EngineErrorCode.InvalidArg, 'not a memory candidate');
    const { mem } = this.runtime;
    const bufPtr = mem.alloc(saved.bytes.byteLength);
    try {
      mem.writeBytes(bufPtr, saved.bytes);
      writeContentsInHeap(this.runtime, bufPtr, saved.bytes.byteLength, 0, sealed, cms);
      saved.bytes = copyOut(mem.readBytes(bufPtr, saved.bytes.byteLength));
    } finally {
      mem.free(bufPtr);
    }
  }

  openSealed(saved: SavedCandidate, password: string | null): OpenedPdfDocument {
    if (saved.kind !== 'memory')
      throw new EngineError(EngineErrorCode.InvalidArg, 'not a memory candidate');
    const base = this.baseDocuments.acquireMemoryBase({
      key: `signed:${generateUuid()}`,
      bytes: saved.bytes,
      password,
    });
    return openLayerDocument(this.runtime, base, { kind: 'fresh' }, password);
  }

  discard(): void {
    // The buffer is dropped with the pending record.
  }
}

// ---------------------------------------------------------------------------

/**
 * A candidate written next to the session's base file, through the
 * runtime's local-file surface: the base streams through the writer, the
 * seal patches the object span in place, the digest streams the file, and
 * the sealed file becomes a file base. Only the object span and the CMS
 * are ever held in memory. Node runtimes only.
 */
export class FileCandidateStore implements CandidateStore {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly baseDocuments: BaseDocumentRegistry,
    private readonly basePath: string,
    private readonly candidatePath: (
      basePath: string,
      signingId: string,
    ) => string = defaultCandidatePath,
  ) {}

  save(candidateDocPtr: Ptr, sigObjNum: number, signingId: string): SavedCandidate {
    const { mem, fn } = this.runtime;
    const path = this.candidatePath(this.basePath, signingId);
    this.runtime.fileWrite.removeFile(path);
    const writer = this.runtime.fileWrite.toNodeFile(path);
    try {
      return withScratchN(mem, [U64_BYTES, U64_BYTES, U64_BYTES], ([sizePtr, offPtr, lenPtr]) => {
        pokeU64(mem, sizePtr, 0);
        pokeU64(mem, offPtr, 0);
        pokeU64(mem, lenPtr, 0);
        const ok = fn.EPDFSig_SaveCandidate(
          candidateDocPtr,
          sigObjNum,
          writer.ptr,
          sizePtr,
          offPtr,
          lenPtr,
        );
        if (!ok) {
          throw new EngineError(EngineErrorCode.Unknown, 'failed to save the signing candidate');
        }
        return {
          kind: 'file',
          path,
          size: peekU64(mem, sizePtr),
          objectOffset: peekU64(mem, offPtr),
          objectLength: peekU64(mem, lenPtr),
        };
      });
    } catch (error) {
      writer.close();
      this.runtime.fileWrite.removeFile(path);
      throw error;
    } finally {
      writer.close();
    }
  }

  seal(saved: SavedCandidate, algorithm: Exclude<DigestAlgorithm, 'sha1'>): SealedCandidate {
    if (saved.kind !== 'file')
      throw new EngineError(EngineErrorCode.InvalidArg, 'not a file candidate');
    const { mem, fn } = this.runtime;
    const span = this.runtime.fileAccess.readRange(
      saved.path,
      saved.objectOffset,
      saved.objectLength,
    );
    if (span.byteLength !== saved.objectLength) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'the signing candidate file is shorter than its object span',
      );
    }
    const spanPtr = mem.alloc(span.byteLength);
    let plan: Omit<SealedCandidate, 'digest'>;
    try {
      mem.writeBytes(spanPtr, span);
      plan = sealSpanInHeap(this.runtime, spanPtr, span.byteLength, saved.objectOffset, saved.size);
      this.runtime.fileWrite.writeRange(
        saved.path,
        saved.objectOffset,
        mem.readBytes(spanPtr, span.byteLength),
      );
    } finally {
      mem.free(spanPtr);
    }
    const access = this.runtime.fileAccess.fromNodeFile(saved.path);
    try {
      const digest = withScratchN(
        mem,
        [4 * U64_BYTES, 64, U64_BYTES],
        ([rangePtr, digestPtr, lenPtr]) => {
          for (let k = 0; k < 4; k++) pokeU64(mem, rangePtr, plan.byteRange[k], k * U64_BYTES);
          pokeU64(mem, lenPtr, 64);
          const ok = fn.EPDFSig_DigestFileRange(
            access.ptr,
            rangePtr,
            DIGEST_CODE[algorithm],
            digestPtr,
            lenPtr,
          );
          if (!ok) {
            throw new EngineError(
              EngineErrorCode.Unknown,
              'failed to digest the signing candidate file',
            );
          }
          return copyOut(mem.readBytes(digestPtr, Number(mem.peek(lenPtr, 'i32'))));
        },
      );
      return { ...plan, digest };
    } finally {
      access.close();
    }
  }

  writeContents(saved: SavedCandidate, sealed: SealedCandidate, cms: Uint8Array): void {
    if (saved.kind !== 'file')
      throw new EngineError(EngineErrorCode.InvalidArg, 'not a file candidate');
    const { mem } = this.runtime;
    const span = this.runtime.fileAccess.readRange(
      saved.path,
      saved.objectOffset,
      saved.objectLength,
    );
    const spanPtr = mem.alloc(span.byteLength);
    try {
      mem.writeBytes(spanPtr, span);
      writeContentsInHeap(this.runtime, spanPtr, span.byteLength, saved.objectOffset, sealed, cms);
      this.runtime.fileWrite.writeRange(
        saved.path,
        saved.objectOffset,
        mem.readBytes(spanPtr, span.byteLength),
      );
    } finally {
      mem.free(spanPtr);
    }
  }

  openSealed(saved: SavedCandidate, password: string | null): OpenedPdfDocument {
    if (saved.kind !== 'file')
      throw new EngineError(EngineErrorCode.InvalidArg, 'not a file candidate');
    const base = this.baseDocuments.acquireFileBase({
      key: `signed:${saved.path}`,
      path: saved.path,
      password,
    });
    return openLayerDocument(this.runtime, base, { kind: 'fresh' }, password);
  }

  discard(saved: SavedCandidate): void {
    if (saved.kind === 'file') this.runtime.fileWrite.removeFile(saved.path);
  }
}

/** Beside the base file, named by the signing; the host may override this (server storage layout). */
export function defaultCandidatePath(basePath: string, signingId: string): string {
  return `${basePath}.signing-${signingId}.pdf`;
}
