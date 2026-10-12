import { useEffect, useRef } from 'react';
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
  useAnnotationState,
  useFilePickerProvider,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './file-picker.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'stamp', label: 'Stamp' },
  { id: 'attachment', label: 'Attach a file' },
];

// The toolbar is always mounted, so it gives the stamp and attachment tools their file dialog.
function Toolbar() {
  useFilePickerProvider();
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();

  return (
    <div className="toolbar" role="toolbar">
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
      <p className="hint">
        {activeToolId === 'stamp' && 'Click the page, then pick a PNG or a JPEG'}
        {activeToolId === 'attachment' && 'Click the page, then pick any file'}
      </p>
    </div>
  );
}

// On load: a text file pinned to the cover, and the stamp tool active.
function StartWithAFile() {
  const annotation = useAnnotation();
  const interaction = useInteraction();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    const notes = new File(['Questions for the next review.'], 'notes.txt', { type: 'text/plain' });
    void annotation.create(
      cover,
      { subtype: 'file-attachment', rect: { x: 470, y: 232, width: 20, height: 20 } },
      { file: notes },
    );
    interaction.activateTool('stamp');
  }, [annotation, interaction, ready, cover]);

  return null;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <StartWithAFile />
        <Toolbar />
        <Stage className="stage">
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
