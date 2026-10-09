import { useState } from 'react';
import { useSearchEvent } from '@embedpdf/react/search';

export function MatchCount() {
  const [message, setMessage] = useState('');

  useSearchEvent(
    (search) => search.onCompleted,
    ({ hitCount }) => setMessage(`${hitCount} matches`),
  );

  return <p aria-live="polite">{message}</p>;
}
