import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin, useSelection } from '@embedpdf/react/selection';
import { SearchLayer, searchPlugin, useSearch } from '@embedpdf/react/search';
import { localEngine } from '@embedpdf/engine';

import './dark-mode.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  searchPlugin(),
];

const TITLE = { start: 10, count: 52 };

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// On load: the cover's title is selected and "PDF" is found, so every color below has something to paint.
function ShowColors() {
  const selection = useSelection();
  const search = useSearch();
  const cover = usePageList()[0]?.ref;
  useEffect(() => {
    void search.search({ text: 'PDF' });
  }, [search]);
  useEffect(() => {
    if (cover) selection.select({ page: cover, ...TITLE });
  }, [selection, cover]);
  return null;
}

export default function App() {
  // Your app's own switch: the colors are in the stylesheet, under [data-theme='dark'].
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  return (
    <div className="pdf-viewer" data-theme={theme}>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Theme">
          <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
            Light
          </button>
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
            Dark
          </button>
        </div>
      </div>
      <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
        <DocumentGate fallback={<p className="loading">Loading…</p>}>
          <ShowColors />
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <SearchLayer />
                <SelectionLayer />
              </>
            )}
          </Stage>
        </DocumentGate>
      </Viewer>
    </div>
  );
}
