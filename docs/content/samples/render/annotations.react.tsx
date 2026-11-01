import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './annotations.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source report]
const report = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/report.pdf');
  return { kind: 'bytes', id: 'report', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

type Painter = 'picture' | 'layer';

export default function App() {
  const [painter, setPainter] = useState<Painter>('picture');

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: report }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Who draws the annotations">
            <button
              type="button"
              aria-pressed={painter === 'picture'}
              onClick={() => setPainter('picture')}
            >
              In the page picture
            </button>
            <button
              type="button"
              aria-pressed={painter === 'layer'}
              onClick={() => setPainter('layer')}
            >
              Drawn by the annotation layer
            </button>
          </div>
          <p className="hint">
            {painter === 'picture'
              ? 'Part of the picture: it can’t be picked up.'
              : 'Left out of the picture: click it, then drag it.'}
          </p>
        </div>
        <Stage className="stage">
          {() =>
            painter === 'picture' ? (
              <RenderLayer />
            ) : (
              <>
                <RenderLayer />
                <AnnotationLayer />
              </>
            )
          }
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
