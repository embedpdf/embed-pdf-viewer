import { useState } from 'react';
import { useDocumentsEvent } from '@embedpdf/react/runtime';

export function PageCount() {
  const [pageCount, setPageCount] = useState(0);

  useDocumentsEvent(
    (documents) => documents.onPagesChanged,
    ({ pages }) => setPageCount(pages.length),
  );

  return <span>{pageCount} pages</span>;
}
