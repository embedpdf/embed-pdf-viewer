import { useState } from 'react';
import { PDFViewer, ToolbarItem, type Layout } from '@embedpdf/viewer-react';

import './status.css';

// [!doc-source proposal]
const proposal = '/pdfs/proposal.pdf';
// [!/doc-source]

const layout = (layout: Layout) => layout.add({ custom: 'status' }, { to: 'main', section: 'end' });

function ReviewStatus({
  status,
  onChange,
}: {
  status: string;
  onChange: (status: string) => void;
}) {
  return (
    <label className="status" data-status={status}>
      <span className="dot" />
      <select
        aria-label="Review status"
        value={status}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="draft">Draft</option>
        <option value="review">In review</option>
        <option value="approved">Approved</option>
      </select>
    </label>
  );
}

export default function App() {
  const [status, setStatus] = useState('review');
  return (
    <PDFViewer src={proposal} layout={layout} style={{ height: '100%' }}>
      <ToolbarItem id="status">
        <ReviewStatus status={status} onChange={setStatus} />
      </ToolbarItem>
    </PDFViewer>
  );
}
