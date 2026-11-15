import {
  EngineError,
  EngineErrorCode,
  VALIDATION_INFO_KINDS,
  validationInfoEntryProblem,
  type ValidationInfo,
  type ValidationInfoAddResult,
  type ValidationInfoCounts,
  type ValidationInfoKind,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { addToValidationStore, readValidationStore } from './internal/validationStore';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { bytesEqual } from '../../shared/bytesEqual';

/**
 * Stores validation data in a document's security store. It decides what
 * the fork is given: every entry is checked before the first one is
 * written, and an entry the document already holds is left out.
 */
export class ValidationInfoMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  add(input: Partial<ValidationInfo>, signal: AbortSignal): ValidationInfoAddResult {
    throwIfAborted(signal);
    for (const kind of VALIDATION_INFO_KINDS) {
      (input[kind] ?? []).forEach((entry, index) => {
        const problem = validationInfoEntryProblem(entry);
        if (problem) {
          throw new EngineError(EngineErrorCode.InvalidArg, `${kind}[${index}]: ${problem}`, {
            details: { field: `${kind}[${index}]` },
          });
        }
      });
    }

    const docPtr = this.session.requireDocPtr();
    const held = readValidationStore(this.runtime, docPtr);
    const added: ValidationInfoCounts = { certificates: 0, ocspResponses: 0, crls: 0 };
    for (const kind of VALIDATION_INFO_KINDS) {
      for (const entry of input[kind] ?? []) {
        throwIfAborted(signal);
        if (holds(held, kind, entry)) continue;
        addToValidationStore(this.runtime, docPtr, kind, entry);
        // The next entry is compared with this one too: a call that names an entry twice stores it once.
        held[kind].push(entry);
        added[kind] += 1;
      }
    }
    return {
      added,
      meta: { affectedPages: [], cacheDelta: null, ...this.session.writeStamp() },
    };
  }
}

/** Whether the document already holds `entry`, byte for byte, among its `kind`. */
function holds(held: ValidationInfo, kind: ValidationInfoKind, entry: Uint8Array): boolean {
  return held[kind].some((other) => bytesEqual(other, entry));
}
