import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
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
  annotationKey,
  annotationPlugin,
  useAnnotationList,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './identity.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const review: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'square', label: 'Rectangle' },
  { id: 'note', label: 'Note' },
];

function Toolbar() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();

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
    </div>
  );
}

const time = (date: string | null) =>
  date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

// Who wrote each annotation, and when: the engine fills these in from the identity.
function Authors() {
  const annotations = useAnnotationList();

  return (
    <ul className="panel authors">
      {annotations.length === 0 && <li className="empty">Draw something</li>}
      {annotations.map((annotation) => (
        <li key={annotationKey(annotation.ref)} className="author">
          <span className="kind">{annotation.subtype}</span>
          <span>
            {annotation.author ?? 'Nobody'} · {time(annotation.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
      initialDocuments={[{ source: review }]}
    >
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
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
          <Authors />
        </div>
      </DocumentGate>
    </Viewer>
  );
}
