import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin, useAnnotation } from '@embedpdf/react/annotation';
import { formPlugin, toFieldRef, useForm } from '@embedpdf/react/form';
import {
  signaturePlugin,
  useSignature,
  useSignatureEvent,
  useSignatureState,
} from '@embedpdf/react/signature';
import { cloudEngine } from '@cloudpdf/engine';

import './break-warning.css';

const engine = cloudEngine();

// The certificate Lanternfield signed the agreement with, published next to it. Trusting it is what
// makes the signature read 'valid'; your app trusts its own certificates the same way.
const lanternfieldCertificate = async () => {
  const response = await fetch('/pdfs/agreement.cer');
  return new Uint8Array(await response.arrayBuffer());
};

const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
  signaturePlugin({ trust: { anchors: async () => [await lanternfieldCertificate()] } }),
];

const agreement: OpenInput = { kind: 'share', shareToken: 'shr_G5GcxJeEBa2IiwIs0DCNruCL' };

// Lanternfield's signature field, signed before the agreement was sent.
const PROVIDER = toFieldRef('provider');

// Two edits after an approval signature: a comment keeps it valid, a new form field breaks it.
function WarningBar() {
  const annotation = useAnnotation();
  const form = useForm();
  const stage = useStage();
  const signature = useSignature();
  const { signatures } = useSignatureState();
  const [warning, setWarning] = useState<string | null>(null);
  const [made, setMade] = useState({ comment: false, field: false });
  const signed = signatures.find((each) => each.signed);
  // Where the signature is: the edits go next to it.
  const widget = form.getWidgets(PROVIDER)[0];
  const revealed = useRef(false);

  // On load: the signatures, in view. Nothing is changed until a button is pressed.
  useEffect(() => {
    if (!widget || revealed.current) return;
    revealed.current = true;
    stage.reveal(widget.page, { rect: widget.rect });
  }, [stage, widget]);

  // The moment a change would break a signature once it's saved, as Acrobat warns.
  useSignatureEvent(
    (plugin) => plugin.onInvalidationPredicted,
    ({ field }) => {
      const name = signature.getSignature(field)?.fieldName;
      setWarning(`This change will break the signature in "${name}" when saved.`);
    },
  );

  const addComment = async () => {
    if (!widget) return;
    const { rect } = widget;
    await annotation.create(widget.page, {
      subtype: 'text',
      rect: { x: rect.x + rect.width + 6, y: rect.y, width: 20, height: 20 },
      contents: 'Looks good to us.',
    });
    setMade((current) => ({ ...current, comment: true }));
  };

  const addField = async () => {
    if (!widget) return;
    const { rect } = widget;
    await form.create({
      family: 'text',
      name: 'purchase_order',
      widgets: [
        {
          page: widget.page,
          rect: { x: rect.x, y: rect.y + rect.height + 36, width: rect.width, height: 24 },
        },
      ],
    });
    setMade((current) => ({ ...current, field: true }));
  };

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!signed || made.comment}
        onClick={() => void addComment()}
      >
        Add a comment
      </button>
      <button
        type="button"
        className="button"
        disabled={!signed || made.field}
        onClick={() => void addField()}
      >
        Add a form field
      </button>
      <output className="readout">
        {signed
          ? `Signed by ${signed.signer.name}: ${signed.verdict?.summary ?? 'checking…'}`
          : 'Opening…'}
      </output>
      {warning && <output className="warning">{warning}</output>}
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: agreement }]}>
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
