import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  FormLayer,
  FormTransfer,
  formPlugin,
  useForm,
  useFormState,
  type FormBundle,
} from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './data.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/** On load: the form filled in. */
function useFilledIn() {
  const form = useForm();
  const status = useFormState((state) => state.status);
  const started = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || started.current) return;
    started.current = true;
    void form.importValues({ name: 'Ada Lovelace', email: 'ada@example.com', framework: 'Svelte' });
  }, [form, status]);
}

function DataToolbar() {
  useFilledIn();
  const form = useForm();
  const [bundle, setBundle] = useState<FormBundle | null>(null);
  const [result, setResult] = useState('');

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        onClick={async () => {
          const exported = await form.export();
          // One JSON text: what you'd store, and read back with FormTransfer.parse().
          const text = FormTransfer.stringify(exported);
          setBundle(exported);
          setResult(`Exported ${exported.fields.length} fields, ${text.length} characters of JSON`);
        }}
      >
        Export
      </button>
      <button
        type="button"
        className="button"
        onClick={async () => {
          for (const field of form.list()) await form.delete(field.ref);
          setResult('The form is gone');
        }}
      >
        Remove
      </button>
      <button
        type="button"
        className="button"
        disabled={!bundle}
        onClick={async () => {
          if (!bundle) return;
          const { fields, dropped } = await form.import(bundle);
          setResult(`Imported ${fields.length} fields, left out ${dropped.length}`);
        }}
      >
        Import
      </button>
      {result && <output className="readout">{result}</output>}
    </div>
  );
}

/** The values as plain data, keyed by full name: what you'd send to your backend. */
function Values() {
  const form = useForm();
  // The state changes with every value, so this reads them again each time.
  useFormState((state) => state.fields);

  return <pre className="values">{JSON.stringify(form.exportValues(), null, 2)}</pre>;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: forms }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <DataToolbar />
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <FormLayer />
              </>
            )}
          </Stage>
          <Values />
        </div>
      </DocumentGate>
    </Viewer>
  );
}
