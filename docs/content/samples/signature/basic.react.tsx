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
  useSignatureVerdicts,
  useSignerRows,
} from '@embedpdf/react/signature';
import type { SignerRow } from '@embedpdf/react/signature';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

const engine = localEngine();
// [!asset-engine]
const assetEngine = engine; // signature marks are drawn as PDFs; they open here too
// [!/asset-engine]
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
  stampPlugin({ assetEngine }),
  signaturePlugin({
    key: () => signer,
    // Trust the demo key itself, so its signatures validate as 'valid'.
    trust: { anchors: async () => [(await signer).certificate] },
  }),
];
const renderers = [formWidgetRenderer];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/** The ebook has no signature field: author one on the first page, once. */
function useSignatureField() {
  const form = useForm();
  const fields = useFormSnapshot()?.fields ?? null;
  const documentId = useDocumentId();
  const firstPage = useKernelValue((kernel) =>
    documentId ? (kernel.documents.getPageAt(0, documentId)?.ref ?? null) : null,
  );
  useEffect(() => {
    if (!fields || firstPage === null || fields.some((f) => f.family === 'signature')) return;
    form
      .createField({
        family: 'signature',
        page: firstPage,
        bounds: { x: 60, y: 620, width: 220, height: 64 },
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
        stamp.createAsset({
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
    <button type="button" className="button" title={label} onClick={onPick}>
      {url ? <img src={url} alt={label} className="preview" /> : label}
    </button>
  );
}

function SignBar() {
  useSignatureField();
  const person = usePerson();
  const signature = useSignature();
  const snapshot = useSignatureSnapshot();
  const verdicts = useSignatureVerdicts();
  const { target, busy } = useSignatureTarget();
  const [error, setError] = useState<string | null>(null);
  const field = snapshot?.signatures[0] ?? null;
  // The check runs after signing; its verdict arrives through the hook.
  const verdict = field && verdicts?.find((v) => v.signature.index === field.index);

  const pick = (assetId: string) => {
    setError(null);
    const destination = target ?? field?.field;
    if (!destination) return;
    // The destination decides: a signature field → sign it (mode 'sign').
    signature
      .placeMark({ assetId }, { field: destination })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  if (!person) return <output className="readout">Creating a signature…</output>;
  return (
    <div className="toolbar">
      <output className="readout">{person.name}</output>
      {person.signatures.map((asset) => (
        <MarkButton
          key={asset.id}
          assetId={asset.id}
          label={asset.label}
          onPick={() => pick(asset.id)}
        />
      ))}
      <span className="spacer" />
      <output className="readout">
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
      </output>
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
              <RenderLayer annotations={false} />
              {/* the signature widget renders "sign here" (sets the target) or "inspect" */}
              <AnnotationLayer renderers={renderers} />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
