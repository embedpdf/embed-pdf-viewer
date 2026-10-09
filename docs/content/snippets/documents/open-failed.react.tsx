import { useState } from 'react';
import { useDocumentsEvent } from '@embedpdf/react/runtime';

export function OpenError() {
  const [message, setMessage] = useState('');

  useDocumentsEvent(
    (documents) => documents.onOpenFailed,
    ({ error }) => setMessage(`Couldn't open the file: ${error.message}`),
  );

  return <p role="alert">{message}</p>;
}
