import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { FormLayer, formPlugin, toFieldRef, useForm, useFormState } from '@embedpdf/react/form';
import { stampPlugin, useStamp, useStampState } from '@embedpdf/react/stamp';
import {
  createTestSigner,
  signaturePlugin,
  useSignatureState,
  useSignerRows,
} from '@embedpdf/react/signature';
import { localEngine } from '@embedpdf/engine';

import './click-to-sign.css';

const engine = localEngine();
// [!asset-engine]
const assetEngine = engine; // a person's marks are stamps, kept as PDFs; they open here too
// [!/asset-engine]
const signer = createTestSigner({ commonName: 'Ada Lovelace' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
  stampPlugin({ assetEngine }),
  signaturePlugin({ key: () => signer }),
];

// [!doc-source agreement]
const agreement = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-agreement.pdf');
  return { kind: 'bytes', id: 'agreement', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/** On load: the agreement, where the form's signature field is, and a person's signature, armed. */
function useSetUp() {
  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const status = useFormState((state) => state.status);
  const done = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || done.current) return;
    done.current = true;
    void (async () => {
      // Bring the agreement's signature field into view.
      const [widget] = form.getWidgets(toFieldRef('approval'));
      if (widget) stage.reveal(widget.page, { rect: widget.rect });
      const { library } = await stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
      const { asset } = await stamp.createAsset({
        libraryId: library.id,
        name: 'signature',
        label: 'Signature',
        mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
      });
      await stamp.armAsset(asset.id, { targetWidth: 160 });
    })();
  }, [form, stamp, stage, status]);
}

function ArmBar() {
  useSetUp();
  const stamp = useStamp();
  const [person] = useSignerRows();
  const { armedAsset } = useStampState();
  const { signatures } = useSignatureState();
  const mark = person?.signatures[0];

  let hint = 'Getting ready…';
  // Ada's signature, once she signs: the agreement already carries EmbedPDF's.
  const signed = signatures.find((each) => each.fieldName === 'approval');
  if (signed) hint = `The field is signed by ${signed.signer.name}`;
  else if (armedAsset) hint = 'Click the empty field to sign it, or anywhere else to place it';
  else if (mark) hint = 'Arm the signature, then click where it goes';

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!mark}
        aria-pressed={armedAsset !== null}
        onClick={() => (armedAsset ? stamp.disarm() : mark && void stamp.armAsset(mark.id))}
      >
        {armedAsset ? 'Disarm' : 'Arm the signature'}
      </button>
      <output className="readout">{hint}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: agreement }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ArmBar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <AnnotationLayer />
              <FormLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
