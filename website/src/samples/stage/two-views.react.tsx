import { Viewer, DocumentGate, createCapabilityToken } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import type { StageCapability } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './two-views.css';

const engine = localEngine();

// A second view of the same document: its own id and token, its own zoom and layout.
const OverviewToken = createCapabilityToken<StageCapability>('stage-overview');

const plugins = [
  stagePlugin(), // the main view
  stagePlugin({
    id: 'stage-overview',
    token: OverviewToken,
    layout: 'grid',
    columns: 'auto',
    zoom: { pageWidth: 72 },
    gap: { px: 10 },
    padding: 10,
    interaction: false, // a drag only scrolls it
    // A wide, short box (a phone) lines the pages up in one row.
    responsive: [{ when: { orientation: 'landscape' }, settings: { layout: 'horizontal' } }],
  }),
  renderPlugin(),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

function ZoomBar({ label, token }: { label: string; token?: typeof OverviewToken }) {
  const stage = useStage(token);
  const zoomLevel = useStageState((state) => state.zoomLevel, token);

  return (
    <div className="zoom-bar">
      <span className="caption">{label}</span>
      <button
        type="button"
        className="button"
        aria-label="Zoom out"
        onClick={() => stage.zoomOut()}
      >
        −
      </button>
      <output className="readout">{Math.round(zoomLevel * 100)}%</output>
      <button type="button" className="button" aria-label="Zoom in" onClick={() => stage.zoomIn()}>
        +
      </button>
    </div>
  );
}

function Views() {
  const main = useStage();
  const current = useStageState((state) => state.currentPageIndex);

  return (
    <div className="views">
      <section className="view overview">
        <ZoomBar label="Overview" token={OverviewToken} />
        <Stage token={OverviewToken} className="stage">
          {(page) => (
            <button
              type="button"
              className="page-button"
              aria-label={`Go to page ${page.pageIndex + 1}`}
              aria-current={page.pageIndex === current}
              onClick={() => main.goToPage(page.ref)}
            >
              <RenderLayer />
            </button>
          )}
        </Stage>
      </section>
      <section className="view main">
        <ZoomBar label="Main view" />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </section>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Views />
      </DocumentGate>
    </Viewer>
  );
}
