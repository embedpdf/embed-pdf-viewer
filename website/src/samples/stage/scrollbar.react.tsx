import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { Scrollbar, useScrollMetrics } from '@embedpdf/react/scrollbar';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// A reading-progress bar, built from the same numbers a scrollbar uses.
function ReadingProgress() {
  const m = useScrollMetrics();
  const travel = m.scrollHeight - m.clientHeight;
  const progress = travel > 0 ? m.scrollTop / travel : 0;
  return (
    <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, marginBottom: 8 }}>
      <div
        style={{
          height: '100%',
          width: `${progress * 100}%`,
          background: '#2563eb',
          borderRadius: 2,
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p>Loading…</p>}>
        <ReadingProgress />
        <div style={{ height: 440 }}>
          <Stage
            style={{ height: '100%', background: '#f1f5f9', borderRadius: 8 }}
            overlay={<Scrollbar axis="y" />}
          >
            {() => <RenderLayer />}
          </Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}
