import { useState } from 'react';
import { useOutlineEvent } from '@embedpdf/react/outline';

export function OutlineNotice() {
  const [notice, setNotice] = useState('');

  useOutlineEvent(
    (outline) => outline.onChanged,
    ({ type, items, origin }) => {
      if (origin.kind === 'remote') setNotice(`Someone ${type} ${items.length} bookmark(s)`);
    },
  );

  return <p role="status">{notice}</p>;
}
