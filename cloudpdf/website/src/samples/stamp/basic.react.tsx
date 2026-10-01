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
import { cloudEngine } from '@cloudpdf/engine';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const assetEngine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  stampPlugin({ assetEngine }),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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
      .then((bytes) => stamp.importLibrary(bytes))
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
    <button
      type="button"
      className="button"
      title={`${asset.label} (/Name ${asset.name})`}
      onClick={onArm}
    >
      {armed ? '▸ ' : ''}
      {url ? <img src={url} alt={asset.label} className="preview" /> : asset.label}
    </button>
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

  if (error) return <output className="readout">Could not load the stamps: {error}</output>;
  if (libraries.length === 0) return <output className="readout">Loading stamps…</output>;
  return (
    <div className="toolbar">
      <output className="readout">{libraries[0].name}</output>
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
      <span className="spacer" />
      <button
        type="button"
        className="button"
        title="Put the stamp tool down"
        disabled={!armed}
        onClick={disarm}
      >
        Done
      </button>
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
              <RenderLayer annotations={false} />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
