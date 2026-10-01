import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, usePages, useStageSettings } from '@embedpdf/react/stage';
import type { StageSettings } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './presets.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
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

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

type Feel = 'reading' | 'presentation';

function FeelSwitcher() {
  const { update } = useStageSettings();
  const { next, previous } = usePages();
  const [feel, setFeel] = useState<Feel>('reading');
  const pick = (name: Feel) => {
    setFeel(name);
    update(name === 'reading' ? READING : PRESENTATION);
  };
  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Feel">
        <button type="button" aria-pressed={feel === 'reading'} onClick={() => pick('reading')}>
          Reading feel
        </button>
        <button
          type="button"
          aria-pressed={feel === 'presentation'}
          onClick={() => pick('presentation')}
        >
          Presentation feel
        </button>
      </div>
      <div className="pager">
        <button type="button" className="button" onClick={() => previous()}>
          ‹ Previous
        </button>
        <button type="button" className="button" onClick={() => next()}>
          Next ›
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <FeelSwitcher />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
