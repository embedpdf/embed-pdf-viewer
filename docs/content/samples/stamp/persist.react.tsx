import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, saveFile } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import {
  indexedDbByteStore,
  persistStampLibraries,
  restoreStampLibraries,
  stampPlugin,
  useStamp,
  useStampAssetPreviewUrl,
  useStampAssets,
  useStampLibraries,
  useStampState,
} from '@embedpdf/react/stamp';
import type { StampAsset } from '@embedpdf/react/stamp';
import { localEngine } from '@embedpdf/engine';

import './persist.css';

const engine = localEngine();
// [!asset-engine]
const assetEngine = engine; // stamp libraries are PDFs; they open here too
// [!/asset-engine]
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  stampPlugin({ assetEngine }),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// Where the libraries live between visits: this browser's IndexedDB.
const store = indexedDbByteStore('embedpdf-stamp-example');

function StampButton({ asset, armed }: { asset: StampAsset; armed: boolean }) {
  const stamp = useStamp();
  const url = useStampAssetPreviewUrl(asset.id);

  return (
    <button
      type="button"
      className="button"
      title={`Place “${asset.label}”`}
      aria-pressed={armed}
      onClick={() => (armed ? stamp.disarm() : void stamp.armAsset(asset.id))}
    >
      {url ? <img src={url} alt={asset.label} className="preview" /> : asset.label}
    </button>
  );
}

function Libraries() {
  const stamp = useStamp();
  const libraries = useStampLibraries();
  const assets = useStampAssets();
  const { armedAsset } = useStampState();
  const [restored, setRestored] = useState<number | null>(null);
  const started = useRef(false);

  // Every change is written to the store from now on.
  useEffect(() => persistStampLibraries(stamp, store), [stamp]);

  // On load: what the store kept. The first visit starts a library of its own.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void restoreStampLibraries(stamp, store).then(async (ids) => {
      setRestored(ids.length);
      if (ids.length > 0) return;
      const { library } = await stamp.createLibrary('My stamps');
      await stamp.createAsset({
        libraryId: library.id,
        label: 'Checked',
        mark: { kind: 'text', text: 'Checked', fontFamily: 'times-bold-italic', color: '#1f7a3f' },
      });
    });
  }, [stamp]);

  const addStamp = async (libraryId: string) => {
    const label = `Stamp ${assets.length + 1}`;
    await stamp.createAsset({
      libraryId,
      label,
      mark: { kind: 'text', text: label, fontFamily: 'helvetica-bold', color: '#054fb3' },
    });
  };

  return (
    <div className="toolbar">
      {assets.map((asset) => (
        <StampButton key={asset.id} asset={asset} armed={armedAsset?.id === asset.id} />
      ))}
      {libraries.map((library) => (
        <span className="group" key={library.id}>
          <button type="button" className="button" onClick={() => void addStamp(library.id)}>
            Add a stamp
          </button>
          <button
            type="button"
            className="button"
            title="The library as the PDF it is: open it in Acrobat, or import it again"
            onClick={() =>
              void stamp
                .exportLibrary(library.id)
                .then((bytes) => saveFile(bytes, `${library.name}.pdf`, 'application/pdf'))
            }
          >
            Download “{library.name}”
          </button>
        </span>
      ))}
      <span className="spacer" />
      <output className="readout">
        {restored === null
          ? 'Restoring…'
          : `${restored} restored: add a stamp, then reload the page`}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Libraries />
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
