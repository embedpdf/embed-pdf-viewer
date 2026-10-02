import { useEffect, useRef, useState } from 'react';
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
import { localEngine } from '@embedpdf/engine';

import './marks.css';

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

// A signature as a pen would draw it: two strokes, in points.
const loop = Array.from({ length: 48 }, (_, i) => ({
  x: i * 4,
  y: 30 - Math.sin(i / 3) * 16 - i * 0.2,
}));
const underline = [
  { x: 10, y: 52 },
  { x: 180, y: 46 },
];

function MarkButton({ asset, armed }: { asset: StampAsset; armed: boolean }) {
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

function Marks() {
  const stamp = useStamp();
  const [library] = useStampLibraries();
  const marks = useStampAssets({ libraryId: library?.id });
  const { armedAsset } = useStampState();
  const [text, setText] = useState('Ada L.');
  const made = useRef(false);

  // On load: a drawn signature and typed initials, in a library of their own.
  useEffect(() => {
    if (made.current) return;
    made.current = true;
    void stamp.createLibrary('Ada Lovelace').then(async ({ library }) => {
      await stamp.createAsset({
        libraryId: library.id,
        label: 'Signature',
        mark: { kind: 'ink', strokes: [loop, underline], strokeWidth: 2.5, color: '#1d2b53' },
      });
      await stamp.createAsset({
        libraryId: library.id,
        label: 'Initials',
        mark: { kind: 'text', text: 'AL', fontFamily: 'times-italic', color: '#1d2b53' },
      });
    });
  }, [stamp]);

  const typeMark = async () => {
    if (!library || !text.trim()) return;
    const { asset } = await stamp.createAsset({
      libraryId: library.id,
      label: text.trim(),
      mark: { kind: 'text', text: text.trim(), fontFamily: 'times-italic', color: '#1d2b53' },
    });
    await stamp.armAsset(asset.id);
  };

  return (
    <div className="toolbar">
      {marks.map((asset) => (
        <MarkButton key={asset.id} asset={asset} armed={armedAsset?.id === asset.id} />
      ))}
      <span className="spacer" />
      <form
        className="type"
        onSubmit={(event) => {
          event.preventDefault();
          void typeMark();
        }}
      >
        <input
          className="field"
          aria-label="Text of a typed stamp"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="button" disabled={!library || !text.trim()}>
          Type a stamp
        </button>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Marks />
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
