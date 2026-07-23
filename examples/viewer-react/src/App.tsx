/**
 * The wrapper, end to end — one example, four doors:
 *  - CONFIGURE: the chrome transform adds a toolbar socket AND sets the
 *    FRAME — `toolbar: 'bottom'` moves the whole measured main bar (mode
 *    band riding its content side) to the bottom edge.
 *  - SLOT (unit): <DocStatus slot="doc-status"> projects into the toolbar.
 *  - SLOT (region): <AcmeTabBar slot="tabs"> REPLACES the built-in tab bar
 *    wholesale — a component of THIS app, styled by index.css.
 *  - DRIVE: the tab bar is functional purely through el.viewer (onReady):
 *    documents list + active id via `watch`, activate/close via the
 *    documents capability. The kernel's registry IS the tab model.
 */
import { useEffect, useState } from 'react';
import { PDFViewer } from '@embedpdf/viewer-react';
import type { DocInfo, InitialDocument, ViewerHandle } from '@embedpdf/viewer-react';

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

/** A fully custom tab bar — region slot + DRIVE. No chrome internals: the
 *  document list, active id, activate and close all ride el.viewer. */
function AcmeTabBar({ viewer, ...props }: { viewer: ViewerHandle | null; slot?: string }) {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (!viewer) return;
    const offDocs = viewer.watch(
      () => viewer.documents.list(),
      setDocs,
      (a, b) => a.length === b.length && a.every((d, i) => d === b[i]),
    );
    const offActive = viewer.watch(() => viewer.documents.activeId(), setActiveId);
    setDocs(viewer.documents.list());
    setActiveId(viewer.documents.activeId());
    return () => {
      offDocs();
      offActive();
    };
  }, [viewer]);
  return (
    <nav className="acme-tabs" {...props}>
      <span className="brand">ACME DMS</span>
      {docs.map((d) => (
        <button
          key={d.id}
          className={d.id === activeId ? 'tab active' : 'tab'}
          onClick={() => viewer?.documents.setActive(d.id)}
        >
          {d.status === 'loading' ? '…' : (d.name ?? d.id)}
          <span
            className="close"
            onClick={(e) => {
              e.stopPropagation();
              void viewer?.documents.close(d.id);
            }}
          >
            ×
          </span>
        </button>
      ))}
    </nav>
  );
}

const lazyDoc = (id: string, name: string): InitialDocument => ({
  name,
  source: async () => ({
    kind: 'bytes',
    id,
    bytes: new Uint8Array(await (await fetch('/ebook.pdf')).arrayBuffer()),
  }),
});

export function App() {
  const [viewer, setViewer] = useState<ViewerHandle | null>(null);
  return (
    <PDFViewer
      documents={[lazyDoc('proposal', 'Proposal'), lazyDoc('contract', 'Contract')]}
      style={{ height: '100vh', display: 'block' }}
      onReady={setViewer}
      strings={{ en: { 'acme.status': 'Document status' } }}
      commands={[
        {
          id: 'acme:status',
          labelKey: 'acme.status',
          run: () => console.log('[acme:status] opened from overflow'),
        },
      ]}
      chrome={(base, h) => ({
        ...h.addItem(base, {
          bar: 'main',
          section: 'start',
          group: 'workspace',
          item: h.custom('doc-status', { terminal: 'acme:status' }),
        }),
        // The FRAME: the whole measured toolbar (and its mode band) moves to
        // the bottom edge — one line of structure, no layout code.
        frame: { toolbar: 'bottom' },
      })}
    >
      <AcmeTabBar slot="tabs" viewer={viewer} />
      <DocStatus slot="doc-status" />
    </PDFViewer>
  );
}
