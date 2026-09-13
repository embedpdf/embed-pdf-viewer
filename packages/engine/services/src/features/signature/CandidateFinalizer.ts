import type {
  BaseVersionInfo,
  DocumentProtection,
  SignatureDTO,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { writeContentsIntoFile } from './internal/candidateStore';
import { assertSealedSignature } from './internal/sealCheck';
import { acquireSignatureModel } from './internal/signatureModelCache';
import { SignatureReader } from './SignatureReader';
import { DocumentSession } from '../../document-session/DocumentSession';
import type { BaseDocumentRegistry } from '../../document-session/lifecycle/BaseDocumentRegistry';
import { openLayerDocument } from '../../document-session/lifecycle/PdfDocumentOpener';
import { generateUuid } from '../../shared/uuid';

export interface FinalizeCandidateInput {
  /** The rebuilt candidate on this filesystem; patched in place. */
  path: string;
  byteRange: [number, number, number, number];
  contentsSize: number;
  fieldObjectNumber: number;
  cms: Uint8Array;
  password: string | null;
}

export interface FinalizedCandidate {
  signature: SignatureDTO;
  protection: DocumentProtection;
  version: BaseVersionInfo;
}

/**
 * The session-less half of a durable signing. A server prepares a
 * candidate on one replica, keeps only its tail, and may complete it on
 * another: the completing replica rebuilds base ⊕ tail into a private
 * file and hands it here with what the prepare reported. The CMS is
 * hex-encoded into the /Contents hole in place — never more than the
 * hole itself is held in memory — and the file is then opened like any
 * other base and read back through the signature model, so the version
 * returned is the file's own hash and the signature is what the file
 * says, not what the writer meant. Nothing here touches a live session.
 */
export class CandidateFinalizer {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly baseDocuments: BaseDocumentRegistry,
  ) {}

  finalize(input: FinalizeCandidateInput): FinalizedCandidate {
    const [r0, r1, r2, r3] = input.byteRange;
    const size = this.runtime.fileAccess.sizeOf(input.path);
    const isOffset = (n: number) => Number.isSafeInteger(n) && n >= 0;
    if (!input.byteRange.every(isOffset) || r0 !== 0 || r1 >= r2 || r2 + r3 !== size) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `byteRange [${input.byteRange.join(' ')}] does not span a ${size}-byte candidate`,
      );
    }
    // The hole is `<` + hex digits + `>`: the range's gap, less the delimiters.
    const hexLength = r2 - r1 - 2;
    if (!Number.isSafeInteger(input.contentsSize) || hexLength !== 2 * input.contentsSize) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `the /Contents hole holds ${hexLength} hex digits, not the ${2 * input.contentsSize} of contentsSize`,
      );
    }
    if (input.cms.byteLength === 0 || input.cms[0] !== 0x30) {
      throw new EngineError(EngineErrorCode.SignatureRefused, 'the CMS is not a DER SEQUENCE');
    }
    if (input.cms.byteLength > input.contentsSize) {
      throw new EngineError(
        EngineErrorCode.SignatureRefused,
        `the CMS (${input.cms.byteLength} bytes) does not fit the reserved ${input.contentsSize} bytes`,
      );
    }

    writeContentsIntoFile(this.runtime, input.path, { holeOffset: r1, hexLength }, input.cms);

    // A private, never-reused key: the file is this attempt's own and must
    // not alias a base another session holds under the same path.
    const session = new DocumentSession(this.runtime);
    const base = this.baseDocuments.acquireFileBase({
      key: `finalize:${generateUuid()}`,
      path: input.path,
      password: input.password,
    });
    try {
      session.openFromHandle(
        openLayerDocument(this.runtime, base, { kind: 'fresh' }, input.password),
      );
      const model = acquireSignatureModel(this.runtime, session);
      assertSealedSignature(this.runtime, session.requireDocPtr(), model, {
        fieldObjectNumber: input.fieldObjectNumber,
        byteRange: input.byteRange,
        cms: input.cms,
      });
      const reader = new SignatureReader(this.runtime, session);
      const snapshot = reader.readSnapshot();
      const signature = snapshot.signatures.find(
        (s) =>
          s.field.kind === 'objectNumber' && s.field.fieldObjectNumber === input.fieldObjectNumber,
      )!;
      return { signature, protection: snapshot.protection, version: reader.version() };
    } finally {
      // Releases the base acquisition through the handle's close stack.
      session.close();
    }
  }
}
