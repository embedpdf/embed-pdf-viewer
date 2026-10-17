import { useEffect, useRef } from 'react';
import {
  Viewer,
  DocumentGate,
  saveFile,
  useDocument,
  useDocuments,
  usePageList,
} from '@embedpdf/react/runtime';
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
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './download.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// On load: a rectangle on the cover, so there's a change to save.
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

// The annotations are part of the document: the downloaded PDF has every one.
function SaveBar() {
  const documents = useDocuments();
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();
  const { hasUnsavedChanges } = useDocument();

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        aria-pressed={activeToolId === 'ink'}
        onClick={() => interaction.activateTool(activeToolId === 'ink' ? 'pointer' : 'ink')}
      >
        Pen
      </button>
      <button
        type="button"
        className="button"
        onClick={async () => saveFile(await documents.download(), 'ebook-annotated.pdf')}
      >
        Download the PDF
      </button>
      <span className="spacer" />
      <output className="readout">{hasUnsavedChanges ? 'Unsaved changes' : 'All saved'}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddRectangle />
        <SaveBar />
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
