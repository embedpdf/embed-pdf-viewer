import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useLayout, usePages } from '@embedpdf/react/stage';
import type { FlowMode, LayoutKind, SpreadMode } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './layouts.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function LayoutControls() {
  const { flow, layout, spread, setFlow, setLayout, setSpread } = useLayout();
  const { next, previous } = usePages();
  return (
    <div className="toolbar">
      <label className="label">
        Flow
        <select
          className="select"
          value={flow}
          onChange={(event) => setFlow(event.target.value as FlowMode)}
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
          onChange={(event) => setLayout(event.target.value as LayoutKind)}
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
          onChange={(event) => setSpread(event.target.value as SpreadMode)}
        >
          <option value="none">none</option>
          <option value="odd">odd</option>
          <option value="even">even</option>
        </select>
      </label>
      <div className="pager">
        <button type="button" className="button" aria-label="Previous" onClick={() => previous()}>
          ‹
        </button>
        <button type="button" className="button" aria-label="Next" onClick={() => next()}>
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
