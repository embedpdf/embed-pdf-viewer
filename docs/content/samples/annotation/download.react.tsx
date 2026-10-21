import { Viewer, DocumentGate, saveFile, useDocument, useDocuments } from '@embedpdf/react/runtime';
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

import './download.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

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
        onClick={async () => saveFile(await documents.download(), 'annotated.pdf')}
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: review }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
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
