import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useZoom } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import { Button, Demo, Readout, Spacer, StageFrame, Toolbar, stageFill } from '../stage/_shared/chrome';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// Defaults: the base bitmap stops at the 640px budget; tiles carry
// sharpness beyond it — only for the visible region, at your exact zoom.
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function ZoomBar() {
  const { zoom, zoomIn, zoomOut, fitWidth } = useZoom();
  return (
    <Toolbar>
      <Button onClick={() => zoomOut()}>−</Button>
      <Readout>{Math.round(zoom * 100)}%</Readout>
      <Button onClick={() => zoomIn()}>+</Button>
      <Spacer />
      <Button onClick={() => fitWidth()}>Fit width</Button>
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <ZoomBar />
          <StageFrame height={460}>
            <Stage style={stageFill}>{() => <RenderLayer />}</Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
