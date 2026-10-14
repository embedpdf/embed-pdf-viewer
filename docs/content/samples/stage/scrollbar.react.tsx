import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Scrollbar, Stage, stagePlugin, useScrollMetrics } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './scrollbar.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

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
