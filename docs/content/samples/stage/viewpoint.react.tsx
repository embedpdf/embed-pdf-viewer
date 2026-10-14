import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput, PageRef } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import type { StageViewState, Viewpoint } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './viewpoint.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function Memory() {
  const stage = useStage();
  const { currentPageIndex, zoomLevel } = useStageState();
  // One spot on one page, and the whole view: settings and position.
  const [spot, setSpot] = useState<{ page: PageRef; viewpoint: Viewpoint; label: string } | null>(
    null,
  );
  const [view, setView] = useState<StageViewState | null>(null);

  const rememberSpot = () => {
    const page = stage.getCurrentPage();
    if (!page) return;
    const label = `page ${stage.getCurrentPageIndex() + 1}`;
    setSpot({ page, viewpoint: stage.getViewpoint(), label });
  };

  // Remember where the reader starts, so "Go back" works right away.
  useEffect(rememberSpot, [stage]);

  return (
    <div className="toolbar">
      <div className="group">
        <button type="button" className="button" onClick={rememberSpot}>
          Remember this spot
        </button>
        <button
          type="button"
          className="button"
          disabled={!spot}
          onClick={() => spot && stage.goToPage(spot.page, { viewpoint: spot.viewpoint })}
        >
          Go back{spot ? ` to ${spot.label}` : ''}
        </button>
      </div>
      <div className="group">
        <button type="button" className="button" onClick={() => setView(stage.getViewState())}>
          Save the view
        </button>
        <button
          type="button"
          className="button"
          disabled={!view}
          onClick={() => view && stage.applyViewState(view)}
        >
          Restore it
        </button>
      </div>
      <output className="badge">
        page <strong>{currentPageIndex + 1}</strong> ·{' '}
        <strong>{Math.round(zoomLevel * 100)}%</strong>
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Memory />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
