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

import {
  Button,
  Demo,
  Readout,
  Spacer,
  StageFrame,
  Toolbar,
  stageFill,
} from '../stage/_shared/chrome';

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
    <Button title={`Place "${asset.label}"`} onClick={onArm}>
      {url ? <img src={url} alt={asset.label} style={{ height: 22 }} /> : asset.label}
    </Button>
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
  const pages = new Set(selected.map((a) => a.page.pageObjectNumber));
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
    <Toolbar>
      <Button
        title="Draw a rectangle on the page"
        onClick={() => activate(activeToolId === 'square' ? 'pointer' : 'square')}
      >
        {activeToolId === 'square' ? '▸ ' : ''}▭ Draw
      </Button>
      <Button
        title="Turn the selected annotation(s) into a reusable stamp"
        disabled={!canMake}
        onClick={() => void make().catch((err) => setStatus(String(err)))}
      >
        Make stamp
      </Button>
      {mine.map((asset) => (
        <MyStamp key={asset.id} asset={asset} onArm={() => void armAsset(asset.id)} />
      ))}
      <Spacer />
      <Readout>{status}</Readout>
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <MakeStamp />
          <StageFrame height={420}>
            <Stage style={stageFill}>
              {() => (
                <>
                  <RenderLayer annotations={false} />
                  <AnnotationLayer />
                </>
              )}
            </Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
