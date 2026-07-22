import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, usePages, useStageSettings } from '@embedpdf/react/stage';
import type { StageSettings } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import { Demo, Toolbar, Button, Segmented, Spacer, StageFrame, stageFill } from './_shared/chrome';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// A "preset" is just an object you keep around and apply with update().
const READING: Partial<StageSettings> = {
  arrivalAlign: { x: 'start', y: 'start' },
  zoomAlign: { x: 'center', y: 'center' },
  anchorAlign: { x: 'start', y: 'start' },
};
const PRESENTATION: Partial<StageSettings> = {
  arrivalAlign: { x: 'center', y: 'center' },
  zoomAlign: { x: 'center', y: 'center' },
  anchorAlign: { x: 'center', y: 'center' },
};

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

type Feel = 'reading' | 'presentation';

function FeelSwitcher() {
  const { update } = useStageSettings();
  const { next, prev } = usePages();
  const [feel, setFeel] = useState<Feel>('reading');
  const pick = (name: Feel) => {
    setFeel(name);
    update(name === 'reading' ? READING : PRESENTATION);
  };
  return (
    <Toolbar>
      <Segmented<Feel>
        value={feel}
        onChange={pick}
        options={[
          { value: 'reading', label: 'Reading feel' },
          { value: 'presentation', label: 'Presentation feel' },
        ]}
      />
      <Spacer />
      <Button onClick={() => prev()}>‹ Previous</Button>
      <Button onClick={() => next()}>Next ›</Button>
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <FeelSwitcher />
          <StageFrame height={420}>
            <Stage style={stageFill}>{() => <RenderLayer />}</Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
