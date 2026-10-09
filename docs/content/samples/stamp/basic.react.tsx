import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import {
  stampPlugin,
  useStamp,
  useStampAssetPreviewUrl,
  useStampAssets,
  useStampLibraries,
  useStampState,
} from '@embedpdf/react/stamp';
import type { StampAsset } from '@embedpdf/react/stamp';
import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

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

function StampButton({ asset, armed }: { asset: StampAsset; armed: boolean }) {
  const stamp = useStamp();
  const url = useStampAssetPreviewUrl(asset.id);

  return (
    <button
      type="button"
      className="button"
      title={asset.label}
      aria-pressed={armed}
      onClick={() => (armed ? stamp.disarm() : void stamp.armAsset(asset.id))}
    >
      {url ? <img src={url} alt={asset.label} className="preview" /> : asset.label}
    </button>
  );
}

function StampPicker() {
  const stamp = useStamp();
  const [library] = useStampLibraries();
  const assets = useStampAssets({ libraryId: library?.id });
  const { armedAsset } = useStampState(); // the stamp the next click places
  const imported = useRef(false);

  // On load: the standard stamps, English edition, with "Approved" armed.
  useEffect(() => {
    if (imported.current) return;
    imported.current = true;
    void loadDefaultLibrary('en')
      .then((bytes) => stamp.importLibrary(bytes))
      .then(({ library }) => {
        const approved = stamp
          .listAssets({ libraryId: library.id })
          .find((asset) => asset.name === 'Approved');
        if (approved) return stamp.armAsset(approved.id);
      });
  }, [stamp]);

  if (!library) {
    return (
      <div className="toolbar">
        <output className="readout">Loading the stamps…</output>
      </div>
    );
  }

  return (
    <div className="toolbar">
      {assets.slice(0, 6).map((asset) => (
        <StampButton key={asset.id} asset={asset} armed={armedAsset?.id === asset.id} />
      ))}
      <span className="spacer" />
      <output className="readout">
        {armedAsset ? `Click a page to place “${armedAsset.label}”` : 'Pick a stamp'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <StampPicker />
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
