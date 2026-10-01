import { useEffect } from 'react';
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
  AnnotationDraftMenu,
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './polygon.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'polyline', label: 'Polyline' },
];

function Toolbar() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();

  // The polygon tool is active on load: click a few points on the page.
  useEffect(() => {
    interaction.activateTool('polygon');
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
      <p className="hint">Delete removes the selection; Escape stops a shape</p>
    </div>
  );
}

// Done and Cancel next to the shape being drawn, for touch screens.
function DraftMenu() {
  const annotation = useAnnotation();

  return (
    <AnnotationDraftMenu>
      {(draft) => (
        <div className="menu" role="toolbar" aria-label="Shape">
          <button
            type="button"
            disabled={!draft.canFinish}
            onClick={() => annotation.draft.finish()}
          >
            Done
          </button>
          <button type="button" onClick={() => annotation.draft.cancel()}>
            Cancel
          </button>
        </div>
      )}
    </AnnotationDraftMenu>
  );
}

// Delete and Escape: the plugin leaves the keys to your app.
function AnnotationKeys() {
  const annotation = useAnnotation();
  const interaction = useInteraction();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || annotation.text.getEditing()) return;
      if (event.key === 'Delete' || event.key === 'Backspace') void annotation.selection.delete();
      if (event.key === 'Escape') {
        annotation.cancel(); // a drag or a polygon in progress
        interaction.activateDefaultTool();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [annotation, interaction]);

  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AnnotationKeys />
        <Toolbar />
        <Stage className="stage" overlay={<DraftMenu />}>
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
