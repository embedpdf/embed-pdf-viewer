import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, epdfTheme, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin, useSelection } from '@embedpdf/react/selection';
import { cloudEngine } from '@cloudpdf/engine';

import './accent.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

// The characters of "Documents", the first word on the cover.
const FIRST_WORD = { start: 36, count: 9 };
const SWATCHES = ['#3858e9', '#e91e63', '#0f6e56', '#c2410c'];

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

// The first word is selected on load, so the accent shows; drag over any text to see more.
function SelectTitle() {
  const selection = useSelection();
  const cover = usePageList()[0]?.ref;
  useEffect(() => {
    if (cover) selection.select({ page: cover, ...FIRST_WORD });
  }, [selection, cover]);
  return null;
}

export default function App() {
  const [accent, setAccent] = useState('#e91e63');

  return (
    <div className="pdf-viewer" style={epdfTheme({ accent })}>
      <div className="toolbar">
        <label className="picker">
          Accent
          <input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} />
        </label>
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className="swatch"
            aria-label={`Accent ${swatch}`}
            aria-pressed={swatch === accent}
            style={{ background: swatch }}
            onClick={() => setAccent(swatch)}
          />
        ))}
        <code className="value">--epdf-accent: {accent}</code>
      </div>
      <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: welcome }]}>
        <DocumentGate fallback={<p className="loading">Loading…</p>}>
          <SelectTitle />
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <SelectionLayer />
              </>
            )}
          </Stage>
        </DocumentGate>
      </Viewer>
    </div>
  );
}
