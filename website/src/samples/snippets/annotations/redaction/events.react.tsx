import { useState } from 'react';
import { useRedactionEvent } from '@embedpdf/react/redaction';

export function RedactionNotice() {
  const [message, setMessage] = useState('');

  useRedactionEvent(
    (redaction) => redaction.onApplied,
    () => setMessage('Redacted: the content under the marks is gone'),
  );

  return <p aria-live="polite">{message}</p>;
}
