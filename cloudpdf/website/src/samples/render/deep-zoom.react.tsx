import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useZoom } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './deep-zoom.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// Defaults: the base bitmap stops at the 640px budget; tiles carry
// sharpness beyond it — only for the visible region, at your exact zoom.
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function ZoomBar() {
  const { zoom, zoomIn, zoomOut, fitWidth } = useZoom();
  return (
    <div className="toolbar">
      <button type="button" className="button" onClick={() => zoomOut()}>
        −
      </button>
      <output className="readout">{Math.round(zoom * 100)}%</output>
      <button type="button" className="button" onClick={() => zoomIn()}>
        +
      </button>
      <span className="spacer" />
      <button type="button" className="button" onClick={() => fitWidth()}>
        Fit width
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ZoomBar />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
