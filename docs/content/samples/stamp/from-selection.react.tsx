import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
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
  selectionPlugin(),
  annotationPlugin(),
  stampPlugin({ assetEngine }),
];

// [!doc-source approvals]
const approvals = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-approvals.pdf');
  return { kind: 'bytes', id: 'approvals', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const MY_STAMPS = 'my-stamps';
// On load: the document's frame and word, both selected, scrolled into view.
function SelectSeal() {
  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const found = annotation
      .list()
      .filter((each) => each.nm === 'checked-frame' || each.nm === 'checked-text');
    if (found.length === 0) return;
    annotation.selection.set(found.map((each) => each.ref));
    stage.reveal(found[0].page, { rect: found[0].rect });
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: approvals }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectSeal />
        <MakeStamp />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
