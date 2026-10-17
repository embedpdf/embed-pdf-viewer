import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  SearchLayer,
  searchPlugin,
  useSearch,
  useSearchEvent,
  useSearchSettings,
  useSearchState,
} from '@embedpdf/react/search';
import { localEngine } from '@embedpdf/engine';

import './hooks.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const colors = ['#ffd500', '#7dd3fc', '#86efac'];

function SearchBox() {
  // The API: what search can do.
  const search = useSearch();
  // The data to show: re-renders when the count or the active match changes.
  const { hitCount, activeHitIndex } = useSearchState();
  // The settings: re-renders when the highlight color changes.
  const color = useSearchSettings((settings) => settings.highlight.color);
  const [text, setText] = useState('PDF');
  const [announcement, setAnnouncement] = useState('');

  // A call to your function when something happens.
  useSearchEvent(
    (search) => search.onCompleted,
    ({ hitCount }) => setAnnouncement(`The search finished with ${hitCount} matches.`),
  );

  useEffect(() => {
    void search.search({ text });
  }, [search, text]);

  return (
    <>
      <div className="toolbar">
        <input
          className="field"
          type="search"
          aria-label="Search"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <output className="readout">
          {hitCount > 0 ? `${activeHitIndex + 1} of ${hitCount}` : 'No matches'}
        </output>
        <button type="button" className="button" onClick={() => search.nextHit()}>
          Next
        </button>
        {colors.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className="swatch"
            aria-label={`Highlight in ${swatch}`}
            aria-pressed={color === swatch}
            style={{ background: swatch }}
            onClick={() => search.updateSettings({ highlight: { color: swatch } })}
          />
        ))}
        <button type="button" className="button" onClick={() => search.resetSettings()}>
          Reset
        </button>
      </div>
      <p className="announcement" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Opening…</p>}>
        <SearchBox />
        <Stage className="stage">
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
