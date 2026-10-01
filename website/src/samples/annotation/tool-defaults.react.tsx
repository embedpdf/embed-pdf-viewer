import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin, useInteraction } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationDefaults,
  useAnnotationEvent,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './tool-defaults.css';

const engine = localEngine();
// The pen starts with what the reader picked last time: see RememberDefaults below.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin({
    tools: [{ id: 'ink', defaults: JSON.parse(localStorage.getItem('tool:ink') ?? '{}') }],
  }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const COLORS = ['#e5484d', '#1e90ff', '#30a46c', '#1a2748'];

// The pen's color and width, for the strokes that follow.
function PenStyle() {
  const annotation = useAnnotation();
  const defaults = useAnnotationDefaults('ink');

  return (
    <div className="toolbar">
      <div className="swatches" role="group" aria-label="Pen color">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="swatch"
            aria-label={color}
            aria-pressed={defaults.color === color}
            style={{ background: color }}
            onClick={() => annotation.tools.updateDefaults('ink', { color })}
          />
        ))}
      </div>
      <input
        type="color"
        className="color"
        aria-label="Any color"
        value={defaults.color ?? '#000000'}
        onChange={(event) => annotation.tools.updateDefaults('ink', { color: event.target.value })}
      />
      <label className="range">
        Width
        <input
          type="range"
          min={1}
          max={12}
          value={defaults.strokeWidth ?? 1}
          onChange={(event) =>
            annotation.tools.updateDefaults('ink', { strokeWidth: Number(event.target.value) })
          }
        />
        <output className="readout">{defaults.strokeWidth} pt</output>
      </label>
    </div>
  );
}

// Every change is kept for next time.
function RememberDefaults() {
  useAnnotationEvent(
    (annotation) => annotation.tools.onDefaultsChanged,
    ({ toolId, defaults }) => {
      localStorage.setItem(`tool:${toolId}`, JSON.stringify(defaults));
    },
  );

  return null;
}

// On load: the pen is active, with a stroke drawn in its current style.
function StartWithThePen() {
  const annotation = useAnnotation();
  const interaction = useInteraction();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    const wave = Array.from({ length: 24 }, (_, i) => ({
      x: 300 + i * 10,
      y: 540 + Math.sin(i / 2) * 14,
    }));
    void annotation.create(cover, { subtype: 'ink', inkList: [wave] }, undefined, { tool: 'ink' });
    interaction.activateTool('ink');
  }, [annotation, interaction, ready, cover]);

  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <StartWithThePen />
        <RememberDefaults />
        <PenStyle />
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
