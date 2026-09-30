import { useSignature, useSignatureEvent } from '@embedpdf/react/signature';
import { toast } from './toast';

export function SignatureGuard() {
  const signature = useSignature();

  useSignatureEvent(
    (s) => s.onInvalidationPredicted,
    ({ field }) => {
      const name = signature.getSignature(field)?.fieldName;
      toast(`This change will break the signature in "${name}" when saved.`);
    },
  );

  return null;
}
