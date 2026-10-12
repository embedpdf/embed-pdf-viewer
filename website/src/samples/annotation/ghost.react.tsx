import { useEffect, useState, type CSSProperties } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './ghost.css';

const engine = localEngine();
// A preview for the rectangle (off by default for tools you drag), and a fainter one for notes.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin({
    tools: [
      { id: 'square', ghost: true },
      { id: 'note', ghost: { opacity: 0.3 } },
    ],
  }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const TOOLS = [
  { id: 'note', label: 'Note' },
  { id: 'square', label: 'Rectangle' },
];

function Toolbar({
  opacity,
  onOpacity,
}: {
  opacity: number | null;
  onOpacity: (value: number | null) => void;
}) {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();

  // The note tool is active on load: move the pointer over the page.
  useEffect(() => {
    interaction.activateTool('note');
  }, [interaction]);

  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Tool">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            aria-pressed={activeToolId === tool.id}
            onClick={() => interaction.activateTool(tool.id)}
          >
            {tool.label}
          </button>
        ))}
      </div>
      <label className="range">
        From CSS
        <input
          type="range"
          min={0.1}
          max={0.9}
          step={0.1}
          value={opacity ?? 0.5}
          onChange={(event) => onOpacity(Number(event.target.value))}
        />
        <output className="readout">
          {opacity === null ? "each tool's own" : `${Math.round(opacity * 100)}%`}
        </output>
      </label>
      <button
        type="button"
        className="button"
        disabled={opacity === null}
        onClick={() => onOpacity(null)}
      >
        Reset
      </button>
    </div>
  );
}

export default function App() {
  // `--epdf-ghost-opacity` from CSS wins over each tool's own opacity, for every tool.
  const [opacity, setOpacity] = useState<number | null>(null);
  const ghostOpacity = opacity === null ? undefined : { '--epdf-ghost-opacity': opacity };

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Toolbar opacity={opacity} onOpacity={setOpacity} />
        <Stage className="stage" style={ghostOpacity as CSSProperties | undefined}>
          {() => (
            <>
              <RenderLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
