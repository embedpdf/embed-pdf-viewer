import { useEffect } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
  useToolCursor,
} from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationDefaults,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './cursor.css';

const engine = localEngine();
// A standard cursor for the rectangle tool: any CSS cursor name.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin({ tools: [{ id: 'square', cursor: 'cell' }] }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// A pen, 24 × 24, in a color: its tip is the bottom-left corner.
const penIcon = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
  `<path d="M3 21l1.5-5.5L16 4l4 4L8.5 19.5z" fill="${color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>` +
  `</svg>`;

// The pen cursor follows the pen's color.
function InkCursor() {
  const { color = '#000000' } = useAnnotationDefaults('ink');
  useToolCursor({
    toolId: 'ink',
    cursors: { crosshair: { svg: penIcon(color), hotspot: { x: 2, y: 22 } } },
  });
  return null;
}

const COLORS = ['#e5484d', '#1e90ff', '#30a46c', '#1a2748'];

function Toolbar() {
  const annotation = useAnnotation();
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const { color } = useAnnotationDefaults('ink');

  // The pen is active on load: move the pointer over the page.
  useEffect(() => {
    interaction.activateTool('ink');
  }, [interaction]);

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        aria-pressed={activeToolId === 'ink'}
        onClick={() => interaction.activateTool('ink')}
      >
        Pen
      </button>
      <div className="swatches" role="group" aria-label="Pen color">
        {COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className="swatch"
            aria-label={swatch}
            aria-pressed={color === swatch}
            style={{ background: swatch }}
            onClick={() => {
              annotation.tools.updateDefaults('ink', { color: swatch });
              interaction.activateTool('ink');
            }}
          />
        ))}
      </div>
      <button
        type="button"
        className="button"
        aria-pressed={activeToolId === 'square'}
        onClick={() => interaction.activateTool('square')}
      >
        Rectangle
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <InkCursor />
        <Toolbar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer annotations={false} />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
