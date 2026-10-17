import { useSignatureState } from '@embedpdf/react/signature';

export function SignatureList() {
  const { signatures } = useSignatureState();

  return (
    <ul>
      {signatures.map((sig) => (
        <li key={sig.fieldName}>
          {sig.fieldName}: {sig.verdict?.summary ?? 'checking…'}
        </li>
      ))}
    </ul>
  );
}
