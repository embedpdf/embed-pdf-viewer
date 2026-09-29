import {
  EngineError,
  EngineErrorCode,
  decodeStableIdKey,
  toPageRef,
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
  const page = toPageRef(pageObjectNumber);
  if (stableId.kind === 'objectNumber') {
    return { kind: 'objectNumber', page, objectNumber: stableId.objectNumber };
  }
  return { kind: 'nm', page, nm: stableId.nm };
}

export function assertRefMatchesPage(ref: AnnotationRef, pageObjectNumber: number): void {
  if (ref.page.objectNumber !== pageObjectNumber) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `ref.page ${ref.page.objectNumber} != path :pageKey ${pageObjectNumber}`,
    );
  }
}
