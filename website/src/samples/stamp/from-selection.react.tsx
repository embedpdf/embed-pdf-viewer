import { useState } from 'react';
import { Viewer, DocumentGate, toPageRef, useDocumentId } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin, useTool } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationSelection,
} from '@embedpdf/react/annotation';
import {
  stampPlugin,
  useArmStampAsset,
  useStamp,
  useStampAssetPreviewUrl,
  useStampAssets,
} from '@embedpdf/react/stamp';
import type { StampAsset } from '@embedpdf/react/stamp';
import { localEngine } from '@embedpdf/engine';

import './from-selection.css';

const engine = localEngine();
const assetEngine = engine; // stamp libraries are PDFs; they open here too
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  stampPlugin({ assetEngine }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const MY_STAMPS = 'my-stamps';

function MyStamp({ asset, onArm }: { asset: StampAsset; onArm: () => void }) {
  const url = useStampAssetPreviewUrl(asset.id);
  return (
    <button type="button" className="button" title={`Place "${asset.label}"`} onClick={onArm}>
      {url ? <img src={url} alt={asset.label} className="preview" /> : asset.label}
    </button>
  );
}

function MakeStamp() {
  const stamp = useStamp();
  const documentId = useDocumentId();
  const annotation = useAnnotation();
  // Subscribed to the selection (refs) so this re-renders as it changes; the
  // page-space records carry each annotation's page.
  const selectedRefs = useAnnotationSelection();
  const selected = selectedRefs.length > 0 ? annotation.listSelected() : [];
  const selection = selected.map((a) => a.ref);
  const mine = useStampAssets(MY_STAMPS);
  const { armAsset } = useArmStampAsset();
  const { activeToolId, activate } = useTool();
  const [status, setStatus] = useState('draw a shape, select it, make a stamp');

  // One page at a time: a stamp is one page of artwork.
  const pages = new Set(selected.map((a) => a.page.objectNumber));
  const canMake = selection.length > 0 && pages.size === 1 && documentId !== null;

  const make = async () => {
    if (!canMake || !documentId) return;
    const [pageObjectNumber] = pages;
    // The library is created on first use; the identifier is minted in
    // Acrobat's `#…` form so the stamp keeps its identity there too.
    const libraryId = stamp.getLibrary(MY_STAMPS)
      ? MY_STAMPS
      : await stamp.createLibrary('My stamps', { id: MY_STAMPS });
    const assetId = await stamp.createAssetFromAnnotations(
      documentId,
      toPageRef(pageObjectNumber),
      [...selection],
      {
        libraryId,
        label: `Custom stamp ${mine.length + 1}`,
      },
    );
    setStatus(`added ${stamp.getAsset(assetId)?.label ?? assetId}`);
  };

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        title="Draw a rectangle on the page"
        onClick={() => activate(activeToolId === 'square' ? 'pointer' : 'square')}
      >
        {activeToolId === 'square' ? '▸ ' : ''}▭ Draw
      </button>
      <button
        type="button"
        className="button"
        title="Turn the selected annotation(s) into a reusable stamp"
        disabled={!canMake}
        onClick={() => void make().catch((err) => setStatus(String(err)))}
      >
        Make stamp
      </button>
      {mine.map((asset) => (
        <MyStamp key={asset.id} asset={asset} onArm={() => void armAsset(asset.id)} />
      ))}
      <span className="spacer" />
      <output className="readout">{status}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <MakeStamp />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer annotations={false} />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
