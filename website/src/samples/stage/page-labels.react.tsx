import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();

// Reserve a 26px band below every page — the label lives there, so it never
// overlaps the page and never scales away when you zoom.
const plugins = [
  stagePlugin({ pageFrame: { top: 0, right: 0, bottom: 26, left: 0 } }),
  renderPlugin(),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <div style={{ height: 460 }}>
        <DocumentGate fallback={<p>Loading…</p>}>
          <Stage
            style={{ height: '100%', background: '#f1f5f9', borderRadius: 8 }}
            pageChrome={(page) => (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: page.frame.bottom,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  color: '#64748b',
                }}
              >
                Page {page.pageIndex + 1}
              </div>
            )}
          >
            {() => <RenderLayer />}
          </Stage>
        </DocumentGate>
      </div>
    </Viewer>
  );
}
