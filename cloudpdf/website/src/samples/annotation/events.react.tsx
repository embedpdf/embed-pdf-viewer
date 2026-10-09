import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationEvent,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './events.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

interface Entry {
  id: number;
  text: string;
  origin: string;
}

// Every change, once the engine has saved it, newest first.
function ActivityLog() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const nextId = useRef(0);
  const log = (text: string, origin: string) =>
    setEntries((current) => [{ id: nextId.current++, text, origin }, ...current].slice(0, 30));

  useAnnotationEvent(
    (annotation) => annotation.onCreated,
    ({ annotation, origin }) =>
      log(`${annotation.author ?? 'Someone'} added a ${annotation.subtype}`, origin.kind),
  );
  useAnnotationEvent(
    (annotation) => annotation.onUpdated,
    ({ annotation, origin }) => log(`Changed a ${annotation.subtype}`, origin.kind),
  );
  useAnnotationEvent(
    (annotation) => annotation.onDeleted,
    ({ refs, origin }) =>
      log(
        `Deleted ${refs.length === 1 ? 'one annotation' : `${refs.length} annotations`}`,
        origin.kind,
      ),
  );
  useAnnotationEvent(
    (annotation) => annotation.onReordered,
    ({ order, origin }) => log(`Restacked ${order.length} on a page`, origin.kind),
  );

  return (
    <ol className="panel log">
      {entries.length === 0 && <li className="empty">Nothing yet</li>}
      {entries.map((entry) => (
        <li key={entry.id} className="entry">
          <span>{entry.text}</span>
          <span className="origin">{entry.origin}</span>
        </li>
      ))}
    </ol>
  );
}

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'square', label: 'Rectangle' },
  { id: 'ink', label: 'Pen' },
];

function Toolbar() {
  const annotation = useAnnotation();
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const { selected } = useAnnotationState();

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
      <button
        type="button"
        className="button"
        disabled={selected.length === 0}
        onClick={() => annotation.selection.delete()}
      >
        Delete
      </button>
    </div>
  );
}

// On load: a rectangle on the cover, so the log starts with its event.
function AddRectangle() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void annotation.create(cover, {
      subtype: 'square',
      box: { x: 96, y: 506, width: 178, height: 54 },
      color: '#e5484d',
      strokeWidth: 3,
    });
  }, [annotation, ready, cover]);

  return null;
}

export default function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
      initialDocuments={[{ source: ebook }]}
    >
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddRectangle />
        <Toolbar />
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <AnnotationLayer />
              </>
            )}
          </Stage>
          <ActivityLog />
        </div>
      </DocumentGate>
    </Viewer>
  );
}
