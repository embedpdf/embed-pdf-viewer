import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { Scrollbar, useScrollMetrics } from '@embedpdf/react/scrollbar';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './scrollbar.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// A reading-progress bar, built from the same numbers a scrollbar uses.
function ReadingProgress() {
  const m = useScrollMetrics();
  const travel = m.scrollHeight - m.clientHeight;
  const progress = travel > 0 ? m.scrollTop / travel : 0;
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ReadingProgress />
        <Stage className="stage" overlay={<Scrollbar axis="y" />}>
          {() => <RenderLayer />}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
