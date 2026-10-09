import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SearchLayer, searchPlugin, useSearch, useSearchHits } from '@embedpdf/react/search';
import { shellPlugin, useShell, useSurface } from '@embedpdf/react/shell';
import { localEngine } from '@embedpdf/engine';

import './sidebars.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin(), shellPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Both panels share the right side: opening one closes the other.
function PanelButton({ id, label }: { id: string; label: string }) {
  const panel = useSurface(id);
  return (
    <button
      type="button"
      className="button"
      aria-pressed={panel.isOpen}
      onClick={() => panel.toggle({ exclusive: 'right' })}
    >
      {label}
    </button>
  );
}

function SearchPanel() {
  const panel = useSurface('search');
  const search = useSearch();
  const hits = useSearchHits();
  const [text, setText] = useState('PDF');

  useEffect(() => {
    void search.search({ text });
  }, [search, text]);

  if (!panel.isOpen) return null;
  return (
    <aside className="panel" aria-label="Search">
      <header className="panel-header">
        <h3 className="panel-title">Search</h3>
        <button type="button" className="close" aria-label="Close" onClick={panel.close}>
          ×
        </button>
      </header>
      <input
        className="field"
        type="search"
        aria-label="Search"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <ol className="list">
        {hits.map((hit) => (
          <li key={`${hit.page.objectNumber}:${hit.start}`}>
            <button type="button" className="item" onClick={() => search.goToHit(hit)}>
              <span className="item-page">Page {hit.pageIndex + 1}</span>
              {hit.snippet && (
                <span className="item-text">
                  …{hit.snippet.before}
                  <mark>{hit.snippet.match}</mark>
                  {hit.snippet.after}…
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function NotesPanel({ notes, onChange }: { notes: string; onChange: (notes: string) => void }) {
  const panel = useSurface('notes');
  if (!panel.isOpen) return null;
  return (
    <aside className="panel" aria-label="Notes">
      <header className="panel-header">
        <h3 className="panel-title">Notes</h3>
        <button type="button" className="close" aria-label="Close" onClick={panel.close}>
          ×
        </button>
      </header>
      <textarea
        className="field notes"
        aria-label="Notes"
        placeholder="Your notes on this document…"
        value={notes}
        onChange={(event) => onChange(event.target.value)}
      />
    </aside>
  );
}

function Workspace() {
  const shell = useShell();
  // Your app's own data: it stays when the panel closes.
  const [notes, setNotes] = useState('');

  // The search panel is open when the document is.
  useEffect(() => {
    shell.open('search', { exclusive: 'right' });
  }, [shell]);

  return (
    <>
      <div className="toolbar">
        <PanelButton id="search" label="Search" />
        <PanelButton id="notes" label="Notes" />
      </div>
      <div className="workspace">
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SearchLayer />
            </>
          )}
        </Stage>
        <SearchPanel />
        <NotesPanel notes={notes} onChange={setNotes} />
      </div>
    </>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Workspace />
      </DocumentGate>
    </Viewer>
  );
}
