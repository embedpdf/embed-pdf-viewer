import { useState } from 'react';
import { useStampEvent } from '@embedpdf/react/stamp';

export function LibraryStatus() {
  const [message, setMessage] = useState('');

  useStampEvent(
    (stamp) => stamp.onLibraryChanged,
    ({ libraryId, type }) => setMessage(`${libraryId}: ${type}`),
  );

  return <p aria-live="polite">{message}</p>;
}
