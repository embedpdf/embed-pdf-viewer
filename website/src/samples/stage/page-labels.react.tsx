import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import { Demo, StageFrame, stageFill } from './_shared/chrome';

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
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <StageFrame height={460}>
            <Stage
              style={stageFill}
              pageChrome={(page) => (
                <div className="epdf-page-label" style={{ height: page.frame.bottom }}>
                  Page {page.pageIndex + 1}
                </div>
              )}
            >
              {() => <RenderLayer />}
            </Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
