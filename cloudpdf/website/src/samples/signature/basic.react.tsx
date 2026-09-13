import { useEffect, useState } from 'react';
import { Viewer, DocumentGate, useDocumentId, useKernelValue } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { formPlugin, formWidgetRenderer, useForm, useFormSnapshot } from '@embedpdf/react/form';
import { stampPlugin, useStamp, useStampAssetPreviewUrl } from '@embedpdf/react/stamp';
import {
  createTestSigner,
  signaturePlugin,
  useSignature,
  useSignatureSnapshot,
  useSignatureTarget,
  useSignerRows,
} from '@embedpdf/react/signature';
import type { SignerRow } from '@embedpdf/react/signature';
import { cloudEngine } from '@cloudpdf/engine';

import {
  Button,
  Demo,
  Readout,
  Spacer,
  StageFrame,
  Toolbar,
  stageFill,
} from '../stage/_shared/chrome';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// [!signer]
// A throwaway key for the demo. Bring your own with `webCryptoSigner`, a
// service with `remoteSigner`, or a persisted personal one with `personalSigner`.
const signer = createTestSigner({ commonName: 'Demo signer' });
// [!/signer]
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
  stampPlugin({ assetEngine: engine }),
  signaturePlugin({
    signer: () => signer,
    // Trust the demo key itself, so its signatures validate as 'valid'.
    trust: { anchors: async () => [(await signer).certificate] },
  }),
];
const renderers = [formWidgetRenderer];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

/** The ebook has no signature field: author one on the first page, once. */
function useSignatureField() {
  const form = useForm();
  const fields = useFormSnapshot()?.fields ?? null;
  const documentId = useDocumentId();
  const firstPage = useKernelValue((k) =>
    documentId
      ? (k.getState().core.documents[documentId]?.pages[0]?.pageObjectNumber ?? null)
      : null,
  );
  useEffect(() => {
    if (!fields || firstPage === null || fields.some((f) => f.family === 'signature')) return;
    form
      .placeField({
        family: 'signature',
        pageObjectNumber: firstPage,
        box: { x: 60, y: 620, width: 220, height: 64 },
      })
      .catch((err) => console.error(err));
    // Once the snapshot is known; the field appearing is the outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields === null, firstPage]);
}

/** One person, made once: a library of kind 'signatures' with a typed mark. */
function usePerson(): SignerRow | null {
  const stamp = useStamp();
  const rows = useSignerRows();
  useEffect(() => {
    if (rows.length > 0) return;
    stamp
      .createLibrary('Ada Lovelace', { kind: 'signatures' })
      .then((libraryId) =>
        stamp.addAsset({
          libraryId,
          name: 'signature',
          label: 'Signature',
          mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', fontSize: 36 },
        }),
      )
      .catch((err) => console.error(err));
    // Create once per workspace; the row list changing is the outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);
  return rows[0] ?? null;
}

function MarkButton({
  assetId,
  label,
  onPick,
}: {
  assetId: string;
  label: string;
  onPick: () => void;
}) {
  const url = useStampAssetPreviewUrl(assetId);
  return (
    <Button title={label} onClick={onPick}>
      {url ? <img src={url} alt={label} style={{ height: 22 }} /> : label}
    </Button>
  );
}

function SignBar() {
  useSignatureField();
  const person = usePerson();
  const signature = useSignature();
  const snapshot = useSignatureSnapshot();
  const { target, busy } = useSignatureTarget();
  const [error, setError] = useState<string | null>(null);
  const field = snapshot?.signatures[0] ?? null;

  const pick = (assetId: string) => {
    setError(null);
    const destination = target ?? field?.field;
    if (!destination) return;
    // The destination decides: a signature field → sign it (mode 'sign').
    signature
      .placeMark({ assetId }, { field: destination })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  if (!person) return <Readout>Creating a signature…</Readout>;
  const verdict = field && signature.verdictOf(field.field);
  return (
    <Toolbar>
      <Readout>{person.name}</Readout>
      {person.signatures.map((asset) => (
        <MarkButton
          key={asset.id}
          assetId={asset.id}
          label={asset.label}
          onPick={() => pick(asset.id)}
        />
      ))}
      <Spacer />
      <Readout>
        {error
          ? `Error: ${error}`
          : busy
            ? 'Signing…'
            : !field
              ? 'Adding a signature field…'
              : field.signed
                ? `Signed by ${field.signer.name ?? '?'} — ${verdict?.summary ?? 'validating…'}`
                : target
                  ? 'Field selected: pick the mark'
                  : 'Click the field, or pick the mark'}
      </Readout>
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <SignBar />
          <StageFrame height={420}>
            <Stage style={stageFill}>
              {() => (
                <>
                  <RenderLayer annotations={false} />
                  {/* the signature widget renders "sign here" (sets the target) or "inspect" */}
                  <AnnotationLayer renderers={renderers} />
                </>
              )}
            </Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
