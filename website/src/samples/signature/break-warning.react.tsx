import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin, useAnnotation } from '@embedpdf/react/annotation';
import { formPlugin, toFieldRef, useForm, useFormState } from '@embedpdf/react/form';
import { stampPlugin, useStamp } from '@embedpdf/react/stamp';
import {
  createTestSigner,
  signaturePlugin,
  useSignature,
  useSignatureEvent,
  useSignatureState,
} from '@embedpdf/react/signature';
import { localEngine } from '@embedpdf/engine';

import './break-warning.css';

const engine = localEngine();
const assetEngine = engine; // a person's marks are stamps, kept as PDFs; they open here too
const signer = createTestSigner({ commonName: 'Ada Lovelace' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
  stampPlugin({ assetEngine }),
  signaturePlugin({
    key: () => signer,
    // Trust the demo key itself, so its signature checks out as 'valid'.
    trust: { anchors: async () => [(await signer).certificate] },
  }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

/** On load: a signature field on the last page, signed by Ada with a typed signature. */
function useSignedDocument() {
  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const signature = useSignature();
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
        widgets: [{ page, rect: { x: 72, y: 560, width: 220, height: 64 } }],
      });
      stage.goToPage(page);
      const { library } = await stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
      const { asset } = await stamp.createAsset({
        libraryId: library.id,
        name: 'signature',
        label: 'Signature',
        mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
      });
      await signature.sign({ field: toFieldRef('approval'), mark: { assetId: asset.id } });
    })();
  }, [form, stamp, stage, signature, status, page]);
}

function WarningBar() {
  useSignedDocument();
  const annotation = useAnnotation();
  const signature = useSignature();
  const page = usePageList().at(-1)?.ref;
  const { signatures } = useSignatureState();
  const [warning, setWarning] = useState<string | null>(null);
  const signed = signatures[0];

  // The moment a change would break a signature once it's saved, as Acrobat warns.
  useSignatureEvent(
    (plugin) => plugin.onInvalidationPredicted,
    ({ field }) => {
      const name = signature.getSignature(field)?.fieldName;
      setWarning(`This change will break the signature in "${name}" when saved.`);
    },
  );

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!signed || !page}
        onClick={() =>
          page &&
          void annotation.create(page, {
            subtype: 'square',
            box: { x: 320, y: 560, width: 140, height: 64 },
            color: '#e11d48',
            strokeWidth: 2,
          })
        }
      >
        Draw a box on the page
      </button>
      <output className="readout">
        {signed ? `Signed by ${signed.signer.name}: ${signed.verdict?.summary ?? 'checking…'}` : 'Signing…'}
      </output>
      {warning && <output className="warning">{warning}</output>}
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <WarningBar />
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
