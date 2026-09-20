import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin, useTool } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import {
  stampPlugin,
  useArmStampAsset,
  useStamp,
  useStampAssetPreviewUrl,
  useStampAssets,
  useStampLibraries,
} from '@embedpdf/react/stamp';
import type { StampAsset } from '@embedpdf/react/stamp';
import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';
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

/** One library, imported once: the standard stamps, English edition, loaded
 *  as a lazy chunk of this build. The file names itself (its /Title) and
 *  lists its stamps (its named pages). */
function useStandardStamps() {
  const stamp = useStamp();
  const libraries = useStampLibraries();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (libraries.length > 0) return;
    loadDefaultLibrary('en')
      .then((bytes) => stamp.importLibraryPdf(bytes))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // Import once per workspace; the library list changing is the outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);
  return { libraries, error };
}

function StampCell({
  asset,
  armed,
  onArm,
}: {
  asset: StampAsset;
  armed: boolean;
  onArm: () => void;
}) {
  const url = useStampAssetPreviewUrl(asset.id);
  return (
    <Button title={`${asset.label} (/Name ${asset.name})`} onClick={onArm}>
      {armed ? '▸ ' : ''}
      {url ? <img src={url} alt={asset.label} style={{ height: 22 }} /> : asset.label}
    </Button>
  );
}

function StampPicker() {
  const { libraries, error } = useStandardStamps();
  const assets = useStampAssets();
  const { armAsset, disarm } = useArmStampAsset();
  const { activeToolId } = useTool();
  const [armedId, setArmedId] = useState<string | null>(null);
  // Leaving the stamp tool (Escape, another tool) un-highlights the picker.
  const armed = activeToolId === 'stamp' ? armedId : null;

  if (error) return <Readout>Could not load the stamps: {error}</Readout>;
  if (libraries.length === 0) return <Readout>Loading stamps…</Readout>;
  return (
    <Toolbar>
      <Readout>{libraries[0].name}</Readout>
      {assets.slice(0, 5).map((asset) => (
        <StampCell
          key={asset.id}
          asset={asset}
          armed={armed === asset.id}
          onArm={() => {
            setArmedId(asset.id);
            void armAsset(asset.id);
          }}
        />
      ))}
      <Spacer />
      <Button title="Put the stamp tool down" disabled={!armed} onClick={disarm}>
        Done
      </Button>
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <StampPicker />
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
