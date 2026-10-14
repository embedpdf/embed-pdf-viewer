import { useState } from 'react';
import {
  Viewer,
  DocumentGate,
  useDocuments,
  useDocumentsState,
  type DocumentInfo,
  type FailedDocumentInfo,
} from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './states.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A file that isn't a PDF, so its document can't be opened.
const broken: OpenInput = { kind: 'bytes', bytes: new TextEncoder().encode('Not a PDF') };

function Tabs() {
  const documents = useDocuments();
  const { documents: open, activeId } = useDocumentsState();

  return (
    <div className="tabs" role="tablist">
      {open.map((document) => (
        <button
          key={document.id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={document.id === activeId}
          onClick={() => documents.setActive(document.id)}
        >
          <span className="status" data-status={document.status} />
          {document.name}
        </button>
      ))}
    </div>
  );
}

function PasswordForm({ document }: { document: DocumentInfo }) {
  const documents = useDocuments();
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(document.passwordProvided ?? false);

  const unlock = async () => {
    try {
      await documents.unlock(document.id, { password });
    } catch {
      setWrong(true); // it stays locked; ask again
    }
  };

  return (
    <div className="panel">
      <h3>{document.name} needs a password</h3>
      {wrong && <p>That password isn’t right. Try again.</p>}
      <div className="actions">
        <input
          className="field"
          type="password"
          aria-label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="button" className="button" onClick={unlock}>
          Unlock
        </button>
      </div>
    </div>
  );
}

function OpenError({ document }: { document: FailedDocumentInfo }) {
  const documents = useDocuments();
  return (
    <div className="panel" data-tone="error">
      <h3>Couldn’t open {document.name}</h3>
      <p>{document.error.message}</p>
      <div className="actions">
        <button type="button" className="button" onClick={() => documents.retry(document.id)}>
          Try again
        </button>
        <button type="button" className="button" onClick={() => documents.close(document.id)}>
          Close
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[
        { source: ebook, name: 'ebook.pdf' },
        { source: broken, name: 'broken.pdf', active: true },
      ]}
    >
      <Tabs />
      <DocumentGate
        fallback={<div className="panel">Opening…</div>}
        locked={(document) => <PasswordForm document={document} />}
        error={(document) => <OpenError document={document} />}
      >
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
