import {
  EngineError,
  EngineErrorCode,
  decodeAnnotKey,
  toPageRef,
  type AnnotationRef,
} from '@embedpdf/engine-core/runtime';

export function refFromKey(annotKey: string, pageObjectNumber: number): AnnotationRef {
  const ref = decodeAnnotKey(toPageRef(pageObjectNumber), annotKey);
  if (!ref) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `annotKey '${annotKey}' is not a valid annotation key (expected 'obj:N' or 'base:N')`,
    );
  }
  return ref;
}

export function assertRefMatchesPage(ref: AnnotationRef, pageObjectNumber: number): void {
  if (ref.page.objectNumber !== pageObjectNumber) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `ref.page ${ref.page.objectNumber} != path :pageKey ${pageObjectNumber}`,
    );
  }
}
