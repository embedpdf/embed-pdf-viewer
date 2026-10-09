import { useState } from 'react';
import { useMetadataEvent } from '@embedpdf/react/metadata';

export function TitleNotice() {
  const [notice, setNotice] = useState('');

  useMetadataEvent(
    (metadata) => metadata.onUpdated,
    ({ metadata, origin }) => {
      if (origin.kind === 'remote') setNotice(`The title is now "${metadata.title}"`);
    },
  );

  return <p role="status">{notice}</p>;
}
