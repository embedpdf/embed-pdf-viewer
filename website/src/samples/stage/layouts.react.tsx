import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageSettings } from '@embedpdf/react/stage';
import type { FlowMode, LayoutKind, SpreadMode } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './layouts.css';

const engine = localEngine();
// Facing pages from the start, like a book.
const plugins = [stagePlugin({ spread: 'odd' }), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

function LayoutControls() {
  const stage = useStage();
  const { flow, layout, spread } = useStageSettings();

  return (
    <div className="toolbar">
      <label className="label">
        Flow
        <select
          className="select"
          value={flow}
          onChange={(event) => stage.updateSettings({ flow: event.target.value as FlowMode })}
        >
          <option value="continuous">continuous</option>
          <option value="paged">paged</option>
        </select>
      </label>
      <label className="label">
        Layout
        <select
          className="select"
          value={layout}
          onChange={(event) => stage.updateSettings({ layout: event.target.value as LayoutKind })}
        >
          <option value="vertical">vertical</option>
          <option value="horizontal">horizontal</option>
          <option value="grid">grid</option>
        </select>
      </label>
      <label className="label">
        Spread
        <select
          className="select"
          value={spread}
          onChange={(event) => stage.updateSettings({ spread: event.target.value as SpreadMode })}
        >
          <option value="none">none</option>
          <option value="odd">odd</option>
          <option value="even">even</option>
        </select>
      </label>
      <div className="pager">
        <button
          type="button"
          className="button"
          aria-label="Previous"
          onClick={() => stage.previousPage()}
        >
          ‹
        </button>
        <button type="button" className="button" aria-label="Next" onClick={() => stage.nextPage()}>
          ›
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <LayoutControls />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
