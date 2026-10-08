import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
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
import { cloudEngine } from '@cloudpdf/engine';

import './data.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** The ebook has no form, so this adds one to its last page, fills it in, and goes there. */
function useSignUpForm() {
  const form = useForm();
  const stage = useStage();
  const status = useFormState((state) => state.status);
  const page = usePageList().at(-1)?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || !page || added.current) return;
    added.current = true;
    const at = (y: number, width = 240, height = 24) => ({ page, rect: { x: 72, y, width, height } });
    void (async () => {
      await form.create({ family: 'text', name: 'name', widgets: [{ ...at(540), ...look }] });
      await form.create({ family: 'text', name: 'email', widgets: [{ ...at(576), ...look }] });
      await form.create({
        family: 'combobox',
        name: 'framework',
        options: ['React', 'Vue', 'Svelte', 'Angular'].map((label) => ({ label, value: label })),
        widgets: [{ ...at(612, 160), ...look }],
      });
      await form.create({ family: 'checkbox', name: 'updates', widgets: [{ ...at(650, 16, 16), ...look }] });
      await form.importValues({ name: 'Ada Lovelace', email: 'ada@example.com', framework: 'Svelte' });
      stage.goToPage(page);
    })();
  }, [form, stage, status, page]);
}

function DataToolbar() {
  useSignUpForm();
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
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
