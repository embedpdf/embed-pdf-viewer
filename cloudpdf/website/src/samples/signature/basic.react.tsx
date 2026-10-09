import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, useForm, useFormState } from '@embedpdf/react/form';
import { stampPlugin, useStamp, useStampAssetPreviewUrl } from '@embedpdf/react/stamp';
import {
  createTestSigner,
  signaturePlugin,
  useSignature,
  useSignatureState,
  useSignerRows,
} from '@embedpdf/react/signature';
import { cloudEngine } from '@cloudpdf/engine';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const assetEngine = localEngine();
// A throwaway key for the demo. Bring your own with `webCryptoSigner`, a
// service with `remoteSigner`, or a person's own with `personalSigner`.
const signer = createTestSigner({ commonName: 'Ada Lovelace' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  formPlugin(),
  stampPlugin({ assetEngine }),
  signaturePlugin({
    key: () => signer,
    // Trust the demo key itself, so its signatures check out as 'valid'.
    trust: { anchors: async () => [(await signer).certificate] },
  }),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

/**
 * The ebook has no signature field, and the browser holds no signatures yet:
 * add a field to the last page, and one person with a typed signature.
 */
function useSetUp() {
  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const status = useFormState((state) => state.status);
  const page = usePageList().at(-1)?.ref;
  const done = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || !page || done.current) return;
    done.current = true;
    void (async () => {
      await form.create({
        family: 'signature',
        name: 'approval',
        widgets: [{ page, rect: { x: 72, y: 560, width: 220, height: 64 }, color: '#94a3b8' }],
      });
      stage.goToPage(page);
      const { library } = await stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
      await stamp.createAsset({
        libraryId: library.id,
        name: 'signature',
        label: 'Signature',
        mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
      });
    })();
  }, [form, stamp, stage, status, page]);
}

function MarkButton({ assetId, label, onPick }: { assetId: string; label: string; onPick: () => void }) {
  const url = useStampAssetPreviewUrl(assetId);
  return (
    <button type="button" className="button" title={label} onClick={onPick}>
      {url ? <img src={url} alt={label} className="preview" /> : label}
    </button>
  );
}

function SignBar() {
  useSetUp();
  const signature = useSignature();
  const [person] = useSignerRows();
  const { signatures, target, busy } = useSignatureState();
  const field = useFormState((state) => state.fields.find((candidate) => candidate.family === 'signature'));
  const [error, setError] = useState<string | null>(null);
  const signed = signatures[0];

  // The target is the field someone clicked; without one, the form's signature field.
  const sign = (assetId: string) => {
    const destination = target ?? field?.ref;
    if (!destination) return;
    setError(null);
    signature
      .placeMark({ assetId }, { field: destination })
      .catch((reason: Error) => setError(reason.message));
  };

  let status = 'Click the field, or pick the signature';
  if (!person || !field) status = 'Getting ready…';
  else if (error) status = error;
  else if (busy) status = 'Signing…';
  else if (signed) status = `Signed by ${signed.signer.name}: ${signed.verdict?.summary ?? 'checking…'}`;
  else if (target) status = 'Now pick the signature';

  return (
    <div className="toolbar">
      {person?.signatures.map((asset) => (
        <MarkButton key={asset.id} assetId={asset.id} label={asset.label} onPick={() => sign(asset.id)} />
      ))}
      <output className="readout">{status}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SignBar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              {/* An empty signature field is "sign here": a click makes it the target */}
              <FormLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
