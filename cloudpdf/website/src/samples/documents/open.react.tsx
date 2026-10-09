import { Viewer, DocumentGate, useDocument, useDocuments } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './open.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function Toolbar() {
  const documents = useDocuments();
  const { id, name, status, pageCount } = useDocument();

  // A file the user picks opens next to the ebook, and becomes the active document.
  const openFile = async (file: File) => {
    await documents.open({ kind: 'bytes', bytes: await file.arrayBuffer() }, { name: file.name });
  };

  return (
    <div className="toolbar">
      <span className="document">
        {id ? (
          <>
            <strong>{name ?? 'Untitled'}</strong>
            {status === 'ready' ? ` · ${pageCount} pages` : ` · ${status}`}
          </>
        ) : (
          'No document open'
        )}
      </span>
      <label className="button picker">
        Open a PDF…
        <input
          type="file"
          accept="application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void openFile(file);
            event.target.value = '';
          }}
        />
      </label>
      {id ? (
        <button type="button" className="button" onClick={() => documents.close(id)}>
          Close
        </button>
      ) : (
        <button
          type="button"
          className="button"
          onClick={() => documents.open(ebook, { name: 'ebook.pdf' })}
        >
          Open the ebook again
        </button>
      )}
    </div>
  );
}

// The gate's fallback: a document on its way, or none at all.
function Empty() {
  const { id } = useDocument();
  return (
    <p className="loading">{id ? 'Opening…' : 'No document is open. Open a PDF to see it here.'}</p>
  );
}

export default function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[{ source: ebook, name: 'ebook.pdf' }]}
    >
      <Toolbar />
      <DocumentGate fallback={<Empty />}>
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
