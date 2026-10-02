import { useState } from 'react';
import { useStampEvent } from '@embedpdf/react/stamp';

export function LibraryStatus() {
  const [message, setMessage] = useState('');

  useStampEvent(
    (stamp) => stamp.onLibraryChanged,
    ({ libraryId, reason }) => setMessage(`${libraryId}: ${reason}`),
  );

  return <p aria-live="polite">{message}</p>;
}
