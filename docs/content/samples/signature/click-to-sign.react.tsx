import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { FormLayer, formPlugin, useForm, useFormState } from '@embedpdf/react/form';
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

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/** On load: a signature field on the last page, and a person's signature, armed. */
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
      const { asset } = await stamp.createAsset({
        libraryId: library.id,
        name: 'signature',
        label: 'Signature',
        mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
      });
      await stamp.armAsset(asset.id, { targetWidth: 160 });
    })();
  }, [form, stamp, stage, status, page]);
}

function ArmBar() {
  useSetUp();
  const stamp = useStamp();
  const [person] = useSignerRows();
  const { armedAsset } = useStampState();
  const { signatures } = useSignatureState();
  const mark = person?.signatures[0];

  let hint = 'Getting ready…';
  if (signatures[0]) hint = `The field is signed by ${signatures[0].signer.name}`;
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
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
