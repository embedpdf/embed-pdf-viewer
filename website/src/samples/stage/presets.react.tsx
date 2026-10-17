import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageSettings } from '@embedpdf/react/stage';
import type { StageSettings } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './presets.css';

const engine = localEngine();
// Zoomed in, so a page is wider than the view and you can see where it lands.
const plugins = [stagePlugin({ zoom: { level: 1.6 } }), renderPlugin()];

// A preset is an object you keep, and apply with updateSettings().
const READING: Partial<StageSettings> = {
  arrivalAlign: { x: 'start', y: 'start' },
  zoomAlign: { x: 'center', y: 'center' },
  anchorAlign: { x: 'start', y: 'start' },
};
const PRESENTATION: Partial<StageSettings> = {
  arrivalAlign: { x: 'center', y: 'center' },
  zoomAlign: { x: 'center', y: 'center' },
  anchorAlign: { x: 'center', y: 'center' },
};

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

function FeelSwitcher() {
  const stage = useStage();
  // The settings say which feel is on: pages land centered in a presentation.
  const presentation = useStageSettings((settings) => settings.arrivalAlign.y === 'center');

  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Feel">
        <button
          type="button"
          aria-pressed={!presentation}
          onClick={() => stage.updateSettings(READING)}
        >
          Reading
        </button>
        <button
          type="button"
          aria-pressed={presentation}
          onClick={() => stage.updateSettings(PRESENTATION)}
        >
          Presentation
        </button>
      </div>
      <div className="pager">
        <button type="button" className="button" onClick={() => stage.previousPage()}>
          ‹ Previous
        </button>
        <button type="button" className="button" onClick={() => stage.nextPage()}>
          Next ›
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <FeelSwitcher />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
