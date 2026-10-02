import { useEffect } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput, PageDestination, PageInfo } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './destination.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// Destinations as a link, a bookmark or the document's opening view give them.
const destinationsFor = (pages: readonly PageInfo[]) => {
  const pageAt = (index: number) => (pages[index] ?? pages[pages.length - 1]).ref;
  return [
    {
      label: 'xyz: page 3 at (72, 100), 200%',
      destination: { kind: 'xyz', page: pageAt(2), x: 72, y: 100, zoom: 2 },
    },
    { label: 'fit: all of page 2', destination: { kind: 'fit', page: pageAt(1) } },
    { label: 'fitH: page 1 from y = 300', destination: { kind: 'fitH', page: pageAt(0), y: 300 } },
    {
      label: 'fitR: a box on page 4',
      destination: { kind: 'fitR', page: pageAt(3), x: 72, y: 420, width: 260, height: 160 },
    },
  ] satisfies { label: string; destination: PageDestination }[];
};

function Destinations() {
  const stage = useStage();
  const pages = usePageList();
  const { zoomLevel, currentPageIndex } = useStageState();
  const destinations = destinationsFor(pages);

  // Open where the first destination points.
  useEffect(() => {
    if (pages.length > 0) stage.goToDestination(destinationsFor(pages)[0].destination);
  }, [stage, pages]);

  return (
    <div className="toolbar">
      {destinations.map(({ label, destination }) => (
        <button
          key={label}
          type="button"
          className="button"
          onClick={() => stage.goToDestination(destination)}
        >
          {label}
        </button>
      ))}
      <output className="badge">
        page <strong>{currentPageIndex + 1}</strong> ·{' '}
        <strong>{Math.round(zoomLevel * 100)}%</strong>
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Destinations />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
