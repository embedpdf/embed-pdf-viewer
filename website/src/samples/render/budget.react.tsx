import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin, useRender, useRenderSettings } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './budget.css';

const engine = localEngine();
// Zoomed in, where the budget and the tiles show.
const plugins = [stagePlugin({ zoom: { level: 2 } }), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const BUDGETS = [320, 640, 1280];

function BudgetControls() {
  const render = useRender();
  const stage = useStage();
  const maxWidth = useRenderSettings((settings) => settings.fullPage.maxWidth);
  const tiles = useRenderSettings((settings) => settings.tiles !== false);
  const zoomLevel = useStageState((state) => state.zoomLevel);

  return (
    <div className="toolbar">
      <span className="label">Budget</span>
      <div className="segmented" role="group" aria-label="Whole-page budget">
        {BUDGETS.map((width) => (
          <button
            key={width}
            type="button"
            aria-pressed={width === maxWidth}
            onClick={() => render.updateSettings({ fullPage: { maxWidth: width } })}
          >
            {width} px
          </button>
        ))}
      </div>
      <span className="label">Tiles</span>
      <div className="segmented" role="group" aria-label="Tiles">
        <button
          type="button"
          aria-pressed={tiles}
          onClick={() => render.updateSettings({ tiles: { size: 512 } })}
        >
          On
        </button>
        <button
          type="button"
          aria-pressed={!tiles}
          onClick={() => render.updateSettings({ tiles: false })}
        >
          Off
        </button>
      </div>
      <div className="zoom">
        <button
          type="button"
          className="button"
          aria-label="Zoom out"
          onClick={() => stage.zoomOut()}
        >
          −
        </button>
        <output className="readout">{Math.round(zoomLevel * 100)}%</output>
        <button
          type="button"
          className="button"
          aria-label="Zoom in"
          onClick={() => stage.zoomIn()}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <BudgetControls />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
