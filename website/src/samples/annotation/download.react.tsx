import { Viewer, DocumentGate, saveFile, useDocument, useDocuments } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './download.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const report = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/report.pdf');
  return { kind: 'bytes', id: 'report', bytes: new Uint8Array(await response.arrayBuffer()) };
};

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: report }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SaveBar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
