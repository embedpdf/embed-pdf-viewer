import { useState } from 'react';
import { PDFViewer } from '@embedpdf/viewer-react';

export function Upload() {
  const [file, setFile] = useState<File | null>(null);
  return (
    <>
      <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <PDFViewer src={file} style={{ height: '80vh' }} />
    </>
  );
}
