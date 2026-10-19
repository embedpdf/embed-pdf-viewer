import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SearchLayer, searchPlugin, useSearch, useSearchSettings } from '@embedpdf/react/search';
import { localEngine } from '@embedpdf/engine';

import './highlight-colors.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  searchPlugin({ highlight: { color: '#ffd500', activeColor: '#ff9632' } }),
];

// Each pair: every match, and the active one.
const COLORS = [
  { name: 'Yellow', color: '#ffd500', activeColor: '#ff9632' },
  { name: 'Blue', color: '#a5d8ff', activeColor: '#4c9bff' },
  { name: 'Green', color: '#b2f2bb', activeColor: '#40c057' },
  { name: 'Pink', color: '#fcc2d7', activeColor: '#f06595' },
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function ColorPicker() {
  const search = useSearch();
  const current = useSearchSettings((settings) => settings.highlight.color);

  // Something to highlight.
  useEffect(() => {
    void search.search({ text: 'PDF' });
  }, [search]);

  return (
    <>
      {COLORS.map(({ name, color, activeColor }) => (
        <button
          key={name}
          type="button"
          className="swatch"
          aria-label={name}
          aria-pressed={current === color}
          style={{ background: `linear-gradient(135deg, ${color} 50%, ${activeColor} 50%)` }}
          onClick={() => search.updateSettings({ highlight: { color, activeColor } })}
        />
      ))}
      <button type="button" className="button" onClick={() => search.resetSettings()}>
        Reset
      </button>
    </>
  );
}

export default function App() {
  const [fromCss, setFromCss] = useState(false);

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
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
        <Stage className={fromCss ? 'stage from-css' : 'stage'}>
          {() => (
            <>
              <RenderLayer />
              <SearchLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
