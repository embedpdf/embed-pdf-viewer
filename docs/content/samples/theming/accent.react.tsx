import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, epdfTheme, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin, useSelection } from '@embedpdf/react/selection';
import { localEngine } from '@embedpdf/engine';

import './accent.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

// The characters of the cover's title.
const TITLE = { start: 10, count: 52 };
const SWATCHES = ['#3858e9', '#e91e63', '#0f6e56', '#c2410c'];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The cover's title is selected on load, so the accent shows; drag over any text to see more.
function SelectTitle() {
  const selection = useSelection();
  const cover = usePageList()[0]?.ref;
  useEffect(() => {
    if (cover) selection.select({ page: cover, ...TITLE });
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
      <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
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
