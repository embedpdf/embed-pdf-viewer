import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  SelectionHandles,
  SelectionLayer,
  selectionPlugin,
  useSelection,
  useSelectionSettings,
} from '@embedpdf/react/selection';
import { cloudEngine } from '@cloudpdf/engine';

import './colors.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin({ handles: { shadow: '0 1px 3px rgb(0 0 0 / 0.3)' } }),
];

// Each: the selected text and its handles. `null` is the viewer's accent: at 35% for the text.
const COLORS = [
  { name: 'Accent', color: null, handles: null, swatch: '#3858e9' },
  { name: 'Yellow', color: 'rgb(250 204 21 / 0.45)', handles: '#ca8a04', swatch: '#facc15' },
  { name: 'Green', color: 'rgb(34 197 94 / 0.35)', handles: '#16a34a', swatch: '#22c55e' },
  { name: 'Pink', color: 'rgb(236 72 153 / 0.3)', handles: '#db2777', swatch: '#ec4899' },
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function ColorPicker() {
  const selection = useSelection();
  const current = useSelectionSettings((settings) => settings.color);

  return (
    <>
      {COLORS.map(({ name, color, handles, swatch }) => (
        <button
          key={name}
          type="button"
          className="swatch"
          aria-label={name}
          aria-pressed={current === color}
          style={{ background: swatch }}
          onClick={() => selection.updateSettings({ color, handles: { color: handles } })}
        />
      ))}
      <button type="button" className="button" onClick={() => selection.resetSettings()}>
        Reset
      </button>
    </>
  );
}

// Something selected on load: the title on the cover.
function SelectTitle() {
  const selection = useSelection();
  const cover = usePageList()[0]?.ref;

  useEffect(() => {
    if (cover) selection.select({ page: cover, start: 10, count: 52 });
  }, [selection, cover]);

  return null;
}

export default function App() {
  const [fromCss, setFromCss] = useState(false);

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectTitle />
        <div className="toolbar">
          <ColorPicker />
          <label className="option">
            <input
              type="checkbox"
              checked={fromCss}
              onChange={(event) => setFromCss(event.target.checked)}
            />
            Override with CSS
          </label>
        </div>
        <Stage className={fromCss ? 'stage from-css' : 'stage'} overlay={<SelectionHandles />}>
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
