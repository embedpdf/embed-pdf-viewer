import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationSettings,
  useAnnotationState,
  type AnnotationLayerComponents,
  type HandleProps,
  type RotationHandleProps,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './handles.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const layout: OpenInput = { kind: 'share', shareToken: 'shr_d2E_LaTuddJbZR00d1CvkqLM' };

// On load: the document's square, selected, on its page.
function SelectSquare() {
  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const square = annotation.list().find((each) => each.nm === 'square');
    if (!square) return;
    annotation.selection.set([square.ref]);
    stage.reveal(square.page, { rect: square.rect });
  }, [annotation, stage, ready]);

  return null;
}

// Your own handles: the layer places them, and still decides where they can be grabbed.
function Handle({ at, size, rotation, kind, active }: HandleProps) {
  return (
    <div
      className={active ? `handle handle--${kind} handle--active` : `handle handle--${kind}`}
      style={{
        left: at.x - size / 2,
        top: at.y - size / 2,
        width: size,
        height: size,
        rotate: `${rotation}deg`,
      }}
    />
  );
}

function RotationHandle({ at, size, active }: RotationHandleProps) {
  return (
    <div
      className={active ? 'turn turn--active' : 'turn'}
      style={{ left: at.x - size, top: at.y - size, width: size * 2, height: size * 2 }}
    >
      ↻
    </div>
  );
}

const OWN_HANDLES: AnnotationLayerComponents = { Handle, RotationHandle };
const ACCENTS = ['#054fb3', '#e91e63', '#0f6e56'];

function ChromeControls({ own, onOwn }: { own: boolean; onOwn: (own: boolean) => void }) {
  const annotation = useAnnotation();
  const chrome = useAnnotationSettings((settings) => settings.chrome);

  return (
    <div className="toolbar">
      <div className="swatches" role="group" aria-label="Accent">
        {ACCENTS.map((accent) => (
          <button
            key={accent}
            type="button"
            className="swatch"
            aria-label={accent}
            aria-pressed={chrome.accent === accent}
            style={{ background: accent }}
            onClick={() => annotation.updateSettings({ chrome: { accent } })}
          />
        ))}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={chrome.outline.style === 'dashed'}
          onChange={(event) =>
            annotation.updateSettings({
              chrome: { outline: { style: event.target.checked ? 'dashed' : 'solid' } },
            })
          }
        />
        Dashed outline
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={chrome.handles.shape === 'circle'}
          onChange={(event) =>
            annotation.updateSettings({
              chrome: { handles: { shape: event.target.checked ? 'circle' : 'square' } },
            })
          }
        />
        Round handles
      </label>
      <label className="check">
        <input type="checkbox" checked={own} onChange={(event) => onOwn(event.target.checked)} />
        Draw them myself
      </label>
      <button type="button" className="button" onClick={() => annotation.resetSettings()}>
        Reset
      </button>
    </div>
  );
}

export default function App() {
  const [own, setOwn] = useState(false);

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: layout }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectSquare />
        <ChromeControls own={own} onOwn={setOwn} />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <AnnotationLayer components={own ? OWN_HANDLES : undefined} />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
