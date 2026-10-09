import { useEffect, useState } from 'react';
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
import { LOCALES, loadDefaultLibrary } from '@embedpdf/default-stamps/library';
import { cloudEngine } from '@cloudpdf/engine';
import { localEngine } from '@embedpdf/engine';

import './languages.css';

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

function LanguagePicker() {
  const stamp = useStamp();
  const [library] = useStampLibraries();
  const assets = useStampAssets({ libraryId: library?.id });
  const { armedAsset } = useStampState();
  const [locale, setLocale] = useState('nl');

  // The library of the chosen language replaces the one before: the same
  // identifiers, translated labels. Dutch on load.
  useEffect(() => {
    let current = true;
    void loadDefaultLibrary(locale).then(async (bytes) => {
      if (!current) return;
      for (const old of stamp.listLibraries()) await stamp.deleteLibrary(old.id);
      if (current) await stamp.importLibrary(bytes);
    });
    return () => {
      current = false;
    };
  }, [stamp, locale]);

  return (
    <div className="toolbar">
      <select
        className="field"
        aria-label="Language"
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
      {assets.slice(0, 4).map((asset) => (
        <StampButton key={asset.id} asset={asset} armed={armedAsset?.id === asset.id} />
      ))}
      <span className="spacer" />
      <output className="readout">{library?.name ?? 'Loading…'}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <LanguagePicker />
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
