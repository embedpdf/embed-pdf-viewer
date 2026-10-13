import { useMemo, useState } from 'react';
import { PDFViewer } from '@cloudpdf/viewer-react';
import { fetchDocumentToken } from './api'; // your backend: a token for this user and document

type Contract = { id: string; name: string };

export function Contracts({ contracts }: { contracts: Contract[] }) {
  const [id, setId] = useState(contracts[0]?.id);
  // A new src opens the picked document; the same one keeps it open.
  const src = useMemo(() => (id ? { token: () => fetchDocumentToken(id) } : null), [id]);
  return (
    <>
      <select value={id} onChange={(e) => setId(e.target.value)}>
        {contracts.map((contract) => (
          <option key={contract.id} value={contract.id}>
            {contract.name}
          </option>
        ))}
      </select>
      <PDFViewer src={src} style={{ height: '80vh' }} />
    </>
  );
}
