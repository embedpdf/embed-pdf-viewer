import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, saveFile, useDocuments } from '@embedpdf/react/runtime';
import type { OpenInput, PdfSaveMode } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { localEngine } from '@embedpdf/engine';

import './download.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const megabytes = (bytes: Uint8Array) => `${(bytes.byteLength / 1_000_000).toFixed(2)} MB`;

function DownloadBar() {
  const documents = useDocuments();
  const [mode, setMode] = useState<PdfSaveMode>('incremental');
  const [sizes, setSizes] = useState<Record<PdfSaveMode, string> | null>(null);

  // How big each kind of download is: the same document, written two ways.
  useEffect(() => {
    const cancel = new AbortController();
    const { signal } = cancel;
    Promise.all([
      documents.download(undefined, { signal }),
      documents.download(undefined, { mode: 'rewrite', signal }),
    ])
      .then(([incremental, rewrite]) =>
        setSizes({ incremental: megabytes(incremental), rewrite: megabytes(rewrite) }),
      )
      .catch(() => {}); // cancelled: the example went away
    return () => cancel.abort();
  }, [documents]);

  const download = async () => saveFile(await documents.download(undefined, { mode }), 'ebook.pdf');

  return (
    <div className="toolbar">
      <div className="segmented" role="group" aria-label="Kind of download">
        <button
          type="button"
          aria-pressed={mode === 'incremental'}
          onClick={() => setMode('incremental')}
        >
          Incremental
        </button>
        <button type="button" aria-pressed={mode === 'rewrite'} onClick={() => setMode('rewrite')}>
          Rewrite
        </button>
      </div>
      <button
        type="button"
        className="download"
        disabled={!documents.canDownload()}
        onClick={download}
      >
        Download
      </button>
      <output className="sizes">
        {sizes ? (
          <>
            Incremental <strong>{sizes.incremental}</strong> · Rewrite{' '}
            <strong>{sizes.rewrite}</strong>
          </>
        ) : (
          'Measuring…'
        )}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[{ source: ebook, name: 'ebook.pdf' }]}
    >
      <DocumentGate fallback={<p className="loading">Opening…</p>}>
        <DownloadBar />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
