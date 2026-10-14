import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './page-labels.css';

const engine = localEngine();

// Reserve a 26px band below every page: the label lives there, so it never
// covers the page and keeps its size when you zoom.
const plugins = [stagePlugin({ pageFrame: { bottom: 26 } }), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Stage
          className="stage"
          pageChrome={(page) => (
            <div className="page-label" style={{ height: page.frame.bottom }}>
              Page {page.pageIndex + 1}
            </div>
          )}
        >
          {() => <RenderLayer />}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
