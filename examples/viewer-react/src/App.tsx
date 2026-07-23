/**
 * The wrapper, end to end:
 *  - <PDFViewer> = the Preact-compiled <embedpdf-viewer> element behind a
 *    React face; the config props are the standard customization contract.
 *  - The chrome transform reserves a socket (`custom('doc-status', …)`) in
 *    the main bar; the <DocStatus slot="doc-status"> CHILD projects into it
 *    while remaining a real component of THIS app — its useState below and
 *    the .doc-status rules in index.css both keep working.
 *  - Squeeze the window: the socket is measured live, and when it no longer
 *    fits, its terminal command ('acme:status') represents it in the derived
 *    overflow menu.
 */
import { useState } from 'react';
import { PDFViewer } from '@embedpdf/viewer-react';

const STATUS = {
  draft: { label: 'Draft', color: '#f59e0b' },
  review: { label: 'In review', color: '#3b82f6' },
  final: { label: 'Final', color: '#10b981' },
} as const;

function DocStatus(props: { slot?: string }) {
  const [status, setStatus] = useState<keyof typeof STATUS>('draft');
  return (
    <span className="doc-status" {...props}>
      <span className="dot" style={{ background: STATUS[status].color }} />
      <select value={status} onChange={(e) => setStatus(e.target.value as keyof typeof STATUS)}>
        {Object.entries(STATUS).map(([value, { label }]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </span>
  );
}

export function App() {
  return (
    <PDFViewer
      src="/ebook.pdf"
      style={{ height: '100vh', display: 'block' }}
      onReady={(viewer) =>
        console.log('[example] viewer ready,', viewer.documents.list().length, 'document(s)')
      }
      strings={{ en: { 'acme.status': 'Document status' } }}
      commands={[
        {
          id: 'acme:status',
          labelKey: 'acme.status',
          run: () => console.log('[acme:status] opened from overflow'),
        },
      ]}
      chrome={(base, h) =>
        h.addItem(base, {
          bar: 'main',
          section: 'start',
          group: 'workspace',
          item: h.custom('doc-status', { terminal: 'acme:status' }),
        })
      }
    >
      <DocStatus slot="doc-status" />
    </PDFViewer>
  );
}
