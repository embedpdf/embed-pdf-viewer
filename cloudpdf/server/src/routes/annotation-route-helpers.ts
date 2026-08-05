import {
  EngineError,
  EngineErrorCode,
  decodeStableIdKey,
  type AnnotationRef,
} from '@embedpdf/engine-core/runtime';

export function refFromKey(annotKey: string, pageObjectNumber: number): AnnotationRef {
  const stableId = decodeStableIdKey(annotKey);
  if (!stableId) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `annotKey '${annotKey}' is not a valid stable-id key (expected 'obj:N' or 'nm:VALUE')`,
    );
  }
  if (stableId.kind === 'objectNumber') {
    return { kind: 'objectNumber', pageObjectNumber, annotObjectNumber: stableId.value };
  }
  return { kind: 'nm', pageObjectNumber, nm: stableId.value };
}

export function assertRefMatchesPage(ref: AnnotationRef, pageObjectNumber: number): void {
  if (ref.pageObjectNumber !== pageObjectNumber) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `ref.pageObjectNumber ${ref.pageObjectNumber} != path :pon ${pageObjectNumber}`,
    );
  }
}
