/**
 * The React viewer with two components of this app inside it:
 *
 * - a status picker in the main toolbar (`ToolbarItem`, placed by the layout), and
 * - a tab bar of its own in place of the viewer's (`Region name="tabs"`), which reads the open
 *   documents through `usePDFViewer()` and switches and closes them through `viewer.documents`.
 *
 * Both live in the page's DOM, so this app's stylesheet (`index.css`) styles them.
 */
import { useEffect, useState } from 'react';
import { PDFViewer, Region, ToolbarItem, usePDFViewer } from '@embedpdf/viewer-react';
import type { DocumentInfo, InitialDocument, LayoutFunction } from '@embedpdf/viewer-react';

const STATUS = {
  draft: { label: 'Draft', color: '#f59e0b' },
  review: { label: 'In review', color: '#3b82f6' },
  final: { label: 'Final', color: '#10b981' },
} as const;

function DocStatus() {
  const [status, setStatus] = useState<keyof typeof STATUS>('draft');
  return (
    <span className="doc-status">
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

/** This app's own tab bar: the open documents, from the viewer. */
function AcmeTabBar() {
  const viewer = usePDFViewer();
  const [documents, setDocuments] = useState<readonly DocumentInfo[]>(viewer.documents.list());
  const [activeId, setActiveId] = useState<string | null>(viewer.documents.getActiveId());
  useEffect(() => {
    const offDocuments = viewer.watch(() => viewer.documents.list(), setDocuments);
    const offActive = viewer.watch(() => viewer.documents.getActiveId(), setActiveId);
    return () => {
      offDocuments();
      offActive();
    };
  }, [viewer]);
  return (
    <nav className="acme-tabs">
      <span className="brand">ACME DMS</span>
      {documents.map((document) => (
        <button
          key={document.id}
          className={document.id === activeId ? 'tab active' : 'tab'}
          onClick={() => viewer.documents.setActive(document.id)}
        >
          {document.status === 'loading' ? '…' : (document.name ?? document.id)}
          <span
            className="close"
            onClick={(event) => {
              event.stopPropagation();
              void viewer.documents.close(document.id);
            }}
          >
            ×
          </span>
        </button>
      ))}
    </nav>
  );
}

const fromPublic = (id: string, name: string): InitialDocument => ({
  name,
  source: async () => ({
    kind: 'bytes',
    id,
    bytes: new Uint8Array(await (await fetch('/testlab.pdf')).arrayBuffer()),
  }),
});

const layout: LayoutFunction = (base) =>
  base.add({ custom: 'status' }, { to: 'main', section: 'end' });

export function App() {
  return (
    <PDFViewer
      documents={[fromPublic('proposal', 'Proposal'), fromPublic('contract', 'Contract')]}
      layout={layout}
      style={{ height: '100vh', display: 'block' }}
    >
      <ToolbarItem id="status">
        <DocStatus />
      </ToolbarItem>
      <Region name="tabs">
        <AcmeTabBar />
      </Region>
    </PDFViewer>
  );
}
