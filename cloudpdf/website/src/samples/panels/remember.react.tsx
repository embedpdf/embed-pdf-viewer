import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { shellPlugin, useShell, useShellState, useSurface } from '@embedpdf/react/shell';
import type { ShellSnapshot } from '@embedpdf/react/shell';
import { cloudEngine } from '@cloudpdf/engine';

import './remember.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), shellPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The browser may refuse storage, in a private window: then nothing is remembered.
const loadLayout = (): ShellSnapshot | null => {
  try {
    return JSON.parse(localStorage.getItem('panels') ?? 'null') as ShellSnapshot | null;
  } catch {
    return null;
  }
};
const saveLayout = (snapshot: ShellSnapshot) => {
  try {
    localStorage.setItem('panels', JSON.stringify(snapshot));
  } catch {
    // Not remembered this time.
  }
};

const TIPS = [
  'Ctrl or ⌘ and scroll to zoom',
  'Pinch to zoom on a touch screen',
  'Drag between pages to scroll',
];

function PanelButton({ id, label, side }: { id: string; label: string; side: 'left' | 'right' }) {
  const panel = useSurface(id);
  return (
    <button
      type="button"
      className="button"
      aria-pressed={panel.isOpen}
      onClick={() => panel.toggle({ exclusive: side })}
    >
      {label}
    </button>
  );
}

function TipsPanel() {
  const panel = useSurface('tips');
  if (!panel.isOpen) return null;
  return (
    <aside className="panel" aria-label="Tips">
      <h3 className="panel-title">Tips</h3>
      <ul className="tips">
        {TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </aside>
  );
}

function NotesPanel() {
  const panel = useSurface('notes');
  if (!panel.isOpen) return null;
  return (
    <aside className="panel" aria-label="Notes">
      <h3 className="panel-title">Notes</h3>
      <textarea className="notes" aria-label="Notes" placeholder="Your notes on this document…" />
    </aside>
  );
}

function Workspace() {
  const shell = useShell();
  const { openSurfaces } = useShellState();
  const [saved, setSaved] = useState(loadLayout);

  // The layout saved last time, or the tips the first time.
  useEffect(() => {
    const layout = loadLayout();
    if (layout) shell.applySnapshot(layout);
    else shell.open('tips', { exclusive: 'left' });
  }, [shell]);

  const save = () => {
    const layout = shell.getSnapshot();
    saveLayout(layout);
    setSaved(layout);
  };

  const open = openSurfaces.map((surface) => surface.id).join(', ');

  return (
    <>
      <div className="toolbar">
        <PanelButton id="tips" label="Tips" side="left" />
        <PanelButton id="notes" label="Notes" side="right" />
        <span className="spacer" />
        <button type="button" className="button" onClick={save}>
          Save layout
        </button>
        <button
          type="button"
          className="button"
          disabled={!saved}
          onClick={() => saved && shell.applySnapshot(saved)}
        >
          Restore
        </button>
      </div>
      <p className="readout">Open: {open || 'no panels'}</p>
      <div className="workspace">
        <TipsPanel />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
        <NotesPanel />
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
