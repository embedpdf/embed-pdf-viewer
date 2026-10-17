import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { formPlugin, toFieldRef, useForm, useFormState } from '@embedpdf/react/form';
import { stampPlugin, useStamp } from '@embedpdf/react/stamp';
import { signaturePlugin, useSignature, useSignatureEvent } from '@embedpdf/react/signature';
import { localEngine } from '@embedpdf/engine';

import './fill.css';

const engine = localEngine();
// [!asset-engine]
const assetEngine = engine; // a person's marks are stamps, kept as PDFs; they open here too
// [!/asset-engine]
// No key: a mark is only drawn in, nothing is sealed.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  formPlugin(),
  stampPlugin({ assetEngine }),
  signaturePlugin(),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const APPROVAL = toFieldRef('approval');

function FillBar() {
  const form = useForm();
  const stamp = useStamp();
  const stage = useStage();
  const signature = useSignature();
  const status = useFormState((state) => state.status);
  const page = usePageList().at(-1)?.ref;
  const [assetId, setAssetId] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  const done = useRef(false);

  useSignatureEvent((plugin) => plugin.onFilled, () => setDrawn(true));
  useSignatureEvent((plugin) => plugin.onCleared, () => setDrawn(false));

  // On load: a signature field on the last page, a typed signature, drawn into the field.
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
      setAssetId(asset.id);
      await signature.fillField(APPROVAL, { assetId: asset.id });
    })();
  }, [form, stamp, stage, signature, status, page]);

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <FillBar />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
