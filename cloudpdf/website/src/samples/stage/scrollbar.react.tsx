import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Scrollbar, Stage, stagePlugin, useScrollMetrics } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './scrollbar.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// A reading-progress bar, from the same numbers a scrollbar uses.
function ReadingProgress() {
  const { scrollTop, scrollHeight, clientHeight } = useScrollMetrics();
  const travel = scrollHeight - clientHeight;
  const progress = travel > 0 ? Math.round((scrollTop / travel) * 100) : 0;

  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Reading progress"
      aria-valuenow={progress}
    >
      <div className="progress-fill" style={{ width: `${progress}%` }} />
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ReadingProgress />
        <Stage
          className="stage"
          overlay={
            <Scrollbar axis="y" autoHide={1200} className="scrollbar" thumbClassName="thumb" />
          }
        >
          {() => <RenderLayer />}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
