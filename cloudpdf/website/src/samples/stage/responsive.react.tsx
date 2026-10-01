import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import {
  Stage,
  stagePlugin,
  useStage,
  useStageSettings,
  useStageState,
} from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './responsive.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });

// Facing pages with a roomy margin, and one rule for a narrow Stage: a thin
// margin and one page at a time. The rule has a name, so the UI can read it too.
const plugins = [
  stagePlugin({
    padding: 24,
    spread: 'odd',
    responsive: [
      { name: 'compact', when: { maxWidth: 600 }, settings: { padding: 4, spread: 'none' } },
    ],
  }),
  renderPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function Toolbar({ narrow, onNarrow }: { narrow: boolean; onNarrow: (narrow: boolean) => void }) {
  const stage = useStage();
  // One breakpoint drives both the layout and this toolbar.
  const compact = useStageState((state) => state.activeRules.includes('compact'));
  const { padding, spread } = useStageSettings();

  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Stage width">
        <button type="button" aria-pressed={!narrow} onClick={() => onNarrow(false)}>
          Full width
        </button>
        <button type="button" aria-pressed={narrow} onClick={() => onNarrow(true)}>
          360 px
        </button>
      </div>
      <output className="badge" data-on={compact}>
        compact <strong>{compact ? 'on' : 'off'}</strong>
      </output>
      <output className="badge">
        padding <strong>{padding}</strong> · spread <strong>{spread}</strong>
      </output>
      <div className="pager">
        <button type="button" className="button" onClick={() => stage.previousPage()}>
          {compact ? '‹' : '‹ Previous'}
        </button>
        <button type="button" className="button" onClick={() => stage.nextPage()}>
          {compact ? '›' : 'Next ›'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [narrow, setNarrow] = useState(false);

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Toolbar narrow={narrow} onNarrow={setNarrow} />
        <div className="frame" data-width={narrow ? 'narrow' : 'full'}>
          <Stage className="stage">{() => <RenderLayer />}</Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}
