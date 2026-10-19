import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, useDocument, useDocuments } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { metadataPlugin, useMetadata, useMetadataState } from '@embedpdf/react/metadata';
import { localEngine } from '@embedpdf/engine';

import './layer.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), metadataPlugin()];

// The original stays as it is: the document opens with a layer over it, and the changes go there.
const withLayer = async (layer?: Uint8Array): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return {
    kind: 'layerBytes',
    baseBytes: new Uint8Array(await response.arrayBuffer()),
    layer: layer ? { kind: 'artifact', bytes: layer } : { kind: 'fresh' },
  };
};

function LayerBar({ reopened, onReopened }: { reopened: boolean; onReopened: () => void }) {
  const documents = useDocuments();
  const metadata = useMetadata();
  const title = useMetadataState((state) => state.metadata?.title ?? '');
  const { id } = useDocument();
  const [layer, setLayer] = useState<Uint8Array | null>(null);

  // A change on load, so the layer has something in it. Opened again, the title comes from it.
  useEffect(() => {
    if (!reopened) void metadata.update({ title: 'Reviewed by Dana' });
  }, [metadata, reopened]);

  // Only the changes, as bytes you could store next to the original.
  const keepChanges = async () => setLayer(await documents.downloadLayer());

  // Later: the original again, with the stored changes on top.
  const openAgain = async () => {
    if (!layer) return;
    await documents.close(id);
    onReopened();
    await documents.open(() => withLayer(layer), { name: 'ebook.pdf' });
  };

  return (
    <>
      <div className="toolbar">
        <input
          className="field"
          aria-label="Title"
          defaultValue={title}
          key={title}
          onBlur={(event) => metadata.update({ title: event.target.value })}
        />
        <button type="button" className="button" onClick={keepChanges}>
          Keep the changes
        </button>
        <button type="button" className="button" disabled={!layer} onClick={openAgain}>
          Open again with them
        </button>
      </div>
      <p className="note">
        {reopened
          ? 'Opened again: the original, with the title from the stored layer.'
          : layer
            ? `The layer holds the changes in ${layer.byteLength.toLocaleString()} bytes.`
            : 'Change the title, then keep the changes.'}
      </p>
    </>
  );
}

export default function App() {
  const [reopened, setReopened] = useState(false);
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      initialDocuments={[{ source: () => withLayer(), name: 'ebook.pdf' }]}
    >
      <DocumentGate fallback={<p className="loading">Opening…</p>}>
        <LayerBar reopened={reopened} onReopened={() => setReopened(true)} />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
