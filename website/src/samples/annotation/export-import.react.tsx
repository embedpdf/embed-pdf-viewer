import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  AnnotationTransfer,
  annotationPlugin,
  useAnnotation,
  useAnnotationList,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './export-import.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The bundle as one JSON text: what you'd store in your own database.
function Transfer() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const count = useAnnotationList().length;
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const started = useRef(false);

  const exportAll = async () => {
    const bundle = await annotation.export(); // everything
    setText(AnnotationTransfer.stringify(bundle));
    setStatus(`Exported ${bundle.items.length}`);
  };

  const deleteAll = async () => {
    await Promise.all(annotation.list().map((each) => annotation.delete(each.ref)));
    setStatus('Deleted them all');
  };

  const importText = async () => {
    try {
      const { annotations, dropped } = await annotation.import(
        await AnnotationTransfer.parse(text),
      );
      setStatus(`Imported ${annotations.length}, left out ${dropped.length}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  // On load: everything in the document, exported at once.
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    void exportAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <div className="panel transfer">
      <div className="toolbar">
        <button type="button" className="button" onClick={() => void exportAll()}>
          Export
        </button>
        <button
          type="button"
          className="button"
          disabled={count === 0}
          onClick={() => void deleteAll()}
        >
          Delete all
        </button>
        <button
          type="button"
          className="button"
          disabled={text === ''}
          onClick={() => void importText()}
        >
          Import
        </button>
      </div>
      <output className="readout">{status}</output>
      <textarea
        className="bundle"
        aria-label="The exported bundle"
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: review }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <AnnotationLayer />
              </>
            )}
          </Stage>
          <Transfer />
        </div>
      </DocumentGate>
    </Viewer>
  );
}
