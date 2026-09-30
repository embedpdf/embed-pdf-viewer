import { useSignatureEvent } from '@embedpdf/react/signature';
import { showWarning } from './warnings';

export function SaveWarning() {
  useSignatureEvent(
    (signature) => signature.onInvalidationPredicted,
    () => showWarning('Saving this change will break a signature.'),
  );

  return null;
}
