import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import {
  Stage,
  stagePlugin,
  useStage,
  useStageSettings,
  useStageState,
} from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './spacing.css';

const engine = localEngine();
// No responsive rules, so the padding you set applies at every width.
const plugins = [stagePlugin({ padding: 32, gap: { px: 12 }, responsive: [] }), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function SpacingControls() {
  const stage = useStage();
  const { padding, gap } = useStageSettings();
  const zoomLevel = useStageState((state) => state.zoomLevel);
  // A number grows with the zoom; { px } stays the same on screen.
  const onScreen = typeof gap !== 'number';
  const gapSize = typeof gap === 'number' ? gap : gap.px;

  return (
    <div className="toolbar">
      <label className="label">
        Padding
        <input
          className="range"
          type="range"
          min={0}
          max={64}
          value={padding}
          onChange={(event) => stage.updateSettings({ padding: Number(event.target.value) })}
        />
        <output className="value">{padding}</output>
      </label>
      <label className="label">
        Gap
        <input
          className="range"
          type="range"
          min={0}
          max={64}
          value={gapSize}
          onChange={(event) => {
            const size = Number(event.target.value);
            stage.updateSettings({ gap: onScreen ? { px: size } : size });
          }}
        />
        <output className="value">{gapSize}</output>
      </label>
      <div className="segmented" role="group" aria-label="Gap unit">
        <button
          type="button"
          aria-pressed={onScreen}
          onClick={() => stage.updateSettings({ gap: { px: gapSize } })}
        >
          Screen pixels
        </button>
        <button
          type="button"
          aria-pressed={!onScreen}
          onClick={() => stage.updateSettings({ gap: gapSize })}
        >
          Grows with zoom
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
        <SpacingControls />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
