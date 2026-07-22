import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useLayout, usePages } from '@embedpdf/react/stage';
import type { FlowMode, LayoutKind, SpreadMode } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import { Demo, Toolbar, Button, Select, Spacer, StageFrame, stageFill } from './_shared/chrome';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

function LayoutControls() {
  const { flow, layout, spread, setFlow, setLayout, setSpread } = useLayout();
  const { next, prev } = usePages();
  return (
    <Toolbar>
      <Select<FlowMode>
        label="Flow"
        value={flow}
        onChange={setFlow}
        options={[
          { value: 'continuous', label: 'continuous' },
          { value: 'paged', label: 'paged' },
        ]}
      />
      <Select<LayoutKind>
        label="Layout"
        value={layout}
        onChange={setLayout}
        options={[
          { value: 'vertical', label: 'vertical' },
          { value: 'horizontal', label: 'horizontal' },
          { value: 'grid', label: 'grid' },
        ]}
      />
      <Select<SpreadMode>
        label="Spread"
        value={spread}
        onChange={setSpread}
        options={[
          { value: 'none', label: 'none' },
          { value: 'odd', label: 'odd' },
          { value: 'even', label: 'even' },
        ]}
      />
      <Spacer />
      <Button icon onClick={() => prev()} title="Previous">
        ‹
      </Button>
      <Button icon onClick={() => next()} title="Next">
        ›
      </Button>
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <LayoutControls />
          <StageFrame height={420}>
            <Stage style={stageFill}>{() => <RenderLayer />}</Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
