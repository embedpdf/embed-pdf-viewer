import { useState } from 'react';
import { useAttachmentEvent } from '@embedpdf/react/attachment';

export function AttachmentNotice() {
  const [notice, setNotice] = useState('');

  useAttachmentEvent(
    (attachment) => attachment.onChanged,
    ({ type, files, origin }) => {
      if (origin.kind === 'remote') setNotice(`Someone ${type} ${files.length} file(s)`);
    },
  );

  return <p role="status">{notice}</p>;
}
