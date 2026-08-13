import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useZoom } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import {
  Demo,
  Toolbar,
  Button,
  Segmented,
  Readout,
  Spacer,
  StageFrame,
  stageFill,
} from './_shared/chrome';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function ZoomToolbar() {
  const { zoom, mode, zoomIn, zoomOut, fitPage, fitWidth, automatic } = useZoom();
  const setFit = (next: string) => {
    if (next === 'automatic') automatic();
    else if (next === 'fit-page') fitPage();
    else if (next === 'fit-width') fitWidth();
  };
  return (
    <Toolbar>
      <Button icon onClick={zoomOut} title="Zoom out">
        −
      </Button>
      <Readout>{Math.round(zoom * 100)}%</Readout>
      <Button icon onClick={zoomIn} title="Zoom in">
        +
      </Button>
      <Spacer />
      <Segmented
        value={mode}
        onChange={setFit}
        options={[
          { value: 'automatic', label: 'Automatic' },
          { value: 'fit-page', label: 'Fit page' },
          { value: 'fit-width', label: 'Fit width' },
        ]}
      />
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <ZoomToolbar />
          <StageFrame height={420}>
            <Stage style={stageFill}>{() => <RenderLayer />}</Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
