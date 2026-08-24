import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { Scrollbar, useScrollMetrics } from '@embedpdf/react/scrollbar';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import { Demo, ProgressBar, StageFrame, stageFill } from './_shared/chrome';

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
  return <ProgressBar value={progress} />;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <ReadingProgress />
          <StageFrame height={440}>
            <Stage style={stageFill} overlay={<Scrollbar axis="y" />}>
              {() => <RenderLayer />}
            </Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
