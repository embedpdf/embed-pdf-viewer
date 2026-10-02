import { useEffect, useState } from 'react';
import {
  Viewer,
  DocumentGate,
  saveFile,
  useDocument,
  useDocuments,
  useDocumentsEvent,
} from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { metadataPlugin, useMetadata, useMetadataState } from '@embedpdf/react/metadata';
import { localEngine } from '@embedpdf/engine';

import './unsaved.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), metadataPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function TitleBar() {
  const documents = useDocuments();
  const metadata = useMetadata();
  const title = useMetadataState((state) => state.metadata?.title ?? '');
  const { hasUnsavedChanges } = useDocument();

  // A change on load: the document gets a new title, so it has something to lose.
  useEffect(() => {
    void metadata.update({ title: 'Quarterly report (draft)' });
  }, [metadata]);

  // While there's something to lose, the browser asks before the page closes.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  return (
    <div className="toolbar">
      <input
        className="field"
        aria-label="Title"
        defaultValue={title}
        key={title}
        onBlur={(event) => metadata.update({ title: event.target.value })}
      />
      <span className="badge" data-unsaved={hasUnsavedChanges}>
        {hasUnsavedChanges ? 'Unsaved changes' : 'Downloaded'}
      </span>
      <button
        type="button"
        className="button"
        onClick={async () => saveFile(await documents.download(), 'report.pdf')}
      >
        Download
      </button>
    </div>
  );
}

function ChangeLog() {
  const [entries, setEntries] = useState<string[]>([]);
  useDocumentsEvent(
    (documents) => documents.onUnsavedChangesChanged,
    ({ hasUnsavedChanges }) =>
      setEntries((previous) => [
        hasUnsavedChanges
          ? 'It has changes that weren’t downloaded'
          : 'Downloaded: nothing to lose',
        ...previous,
      ]),
  );
  return (
    <ul className="log" aria-live="polite">
      {entries.slice(0, 3).map((entry, index) => (
        <li key={entries.length - index}>{entry}</li>
      ))}
    </ul>
  );
}

export default function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[{ source: ebook, name: 'report.pdf' }]}
    >
      <DocumentGate fallback={<p className="loading">Opening…</p>}>
        <TitleBar />
        <ChangeLog />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
