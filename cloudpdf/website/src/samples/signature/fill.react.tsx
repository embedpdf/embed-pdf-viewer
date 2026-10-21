import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { formPlugin, toFieldRef, useForm, useFormState } from '@embedpdf/react/form';
import { stampPlugin, useStamp } from '@embedpdf/react/stamp';
import { signaturePlugin, useSignature, useSignatureEvent } from '@embedpdf/react/signature';
import { cloudEngine } from '@cloudpdf/engine';
import { localEngine } from '@embedpdf/engine';

import './fill.css';

const engine = cloudEngine();
const assetEngine = localEngine();
// No key: a mark is only drawn in, nothing is sealed.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  formPlugin(),
  stampPlugin({ assetEngine }),
  signaturePlugin(),
];

const forms: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const APPROVAL = toFieldRef('approval');

function FillBar() {
  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const signature = useSignature();
  const status = useFormState((state) => state.status);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  const done = useRef(false);

  useSignatureEvent((plugin) => plugin.onFilled, () => setDrawn(true));
  useSignatureEvent((plugin) => plugin.onCleared, () => setDrawn(false));

  // On load: the invoice, with a typed signature drawn into its signature field.
  useEffect(() => {
    if (status !== 'ready' || done.current) return;
    done.current = true;
    void (async () => {
      // Bring the form's signature field into view, on the invoice.
      const [widget] = form.getWidgets(APPROVAL);
      if (widget) stage.reveal(widget.page, { rect: widget.rect });
      const { library } = await stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
      const { asset } = await stamp.createAsset({
        libraryId: library.id,
        name: 'signature',
        label: 'Signature',
        mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
      });
      setAssetId(asset.id);
      await signature.fillField(APPROVAL, { assetId: asset.id });
    })();
  }, [form, stamp, stage, signature, status]);

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!assetId || drawn}
        onClick={() => assetId && void signature.fillField(APPROVAL, { assetId })}
      >
        Draw it in
      </button>
      <button
        type="button"
        className="button"
        disabled={!drawn}
        onClick={() => void signature.clearField(APPROVAL)}
      >
        Take it out
      </button>
      <output className="readout">
        {drawn ? 'Drawn in, not signed: no key sealed anything' : 'The field is empty'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: forms }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <FillBar />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
