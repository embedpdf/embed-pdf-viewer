import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import {
  stampPlugin,
  useStamp,
  useStampAssetPreviewUrl,
  useStampAssets,
  useStampState,
} from '@embedpdf/react/stamp';
import type { StampAsset } from '@embedpdf/react/stamp';
import { localEngine } from '@embedpdf/engine';

import './from-selection.css';

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

const MY_STAMPS = 'my-stamps';
// An empty corner of the cover, in page coordinates.
const CORNER = { x: 70, y: 600, width: 190, height: 64 };

// On load: a framed text stamp in the cover's empty corner, both parts selected, scrolled into view.
function DrawSeal() {
  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const drawn = useRef(false);

  useEffect(() => {
    if (!ready || drawn.current) return;
    drawn.current = true;
    void Promise.all([
      annotation.create(0, { subtype: 'square', box: CORNER, color: '#c4262e', strokeWidth: 4 }),
      annotation.create(0, {
        subtype: 'free-text',
        intent: 'free-text',
        box: CORNER,
        contents: 'CHECKED',
        fontFamily: 'helvetica-bold',
        fontSize: 30,
        textAlign: 'center',
        verticalAlign: 'middle',
        fontColor: '#c4262e',
        strokeWidth: 0,
      }),
    ]).then((created) => {
      annotation.selection.set(created.map((made) => made.annotation.ref));
      stage.reveal(0, { rect: CORNER });
    });
  }, [annotation, stage, ready]);

  return null;
}

function MyStamp({ asset, armed }: { asset: StampAsset; armed: boolean }) {
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

function MakeStamp() {
  const stamp = useStamp();
  const selected = useAnnotationState((state) => state.selected);
  const mine = useStampAssets({ libraryId: MY_STAMPS });
  const { armedAsset } = useStampState();

  // A stamp is one page of artwork: the selection must be on one page.
  const page = selected[0]?.page;
  const onePage = selected.every(
    (annotation) => annotation.page.objectNumber === page?.objectNumber,
  );
  const canMake = !!page && onePage && stamp.canCreateFromAnnotations();

  const make = async () => {
    if (!page) return;
    // The library is made on first use.
    if (!stamp.getLibrary(MY_STAMPS)) await stamp.createLibrary('My stamps', { id: MY_STAMPS });
    const { asset } = await stamp.createAssetFromAnnotations(
      page,
      selected.map((annotation) => annotation.ref),
      { libraryId: MY_STAMPS, label: `My stamp ${mine.length + 1}` },
    );
    await stamp.armAsset(asset.id);
  };

  return (
    <div className="toolbar">
      <button type="button" className="button" disabled={!canMake} onClick={() => void make()}>
        Make a stamp of the selection
      </button>
      {mine.map((asset) => (
        <MyStamp key={asset.id} asset={asset} armed={armedAsset?.id === asset.id} />
      ))}
      <span className="spacer" />
      <output className="readout">
        {armedAsset ? 'Click a page to place it' : `${selected.length} selected`}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <DrawSeal />
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
