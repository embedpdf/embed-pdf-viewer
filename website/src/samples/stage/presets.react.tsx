import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, usePages, useStageSettings } from '@embedpdf/react/stage';
import type { StageSettings } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

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

function FeelSwitcher() {
  const { update } = useStageSettings();
  const { next, prev } = usePages();
  const [feel, setFeel] = useState<'reading' | 'presentation'>('reading');
  const pick = (name: 'reading' | 'presentation', preset: Partial<StageSettings>) => {
    setFeel(name);
    update(preset);
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
      <button
        onClick={() => pick('reading', READING)}
        style={{ fontWeight: feel === 'reading' ? 'bold' : 'normal' }}
      >
        Reading feel
      </button>
      <button
        onClick={() => pick('presentation', PRESENTATION)}
        style={{ fontWeight: feel === 'presentation' ? 'bold' : 'normal' }}
      >
        Presentation feel
      </button>
      <span style={{ flex: 1 }} />
      <button onClick={() => prev()}>‹ Previous</button>
      <button onClick={() => next()}>Next ›</button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p>Loading…</p>}>
        <FeelSwitcher />
        <div style={{ height: 420 }}>
          <Stage style={{ height: '100%', background: '#f1f5f9', borderRadius: 8 }}>
            {() => <RenderLayer />}
          </Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}
