import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, toFieldRef, useForm, useFormState } from '@embedpdf/react/form';
import type { FormCapability } from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './fill.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** One field of each family, with `setValue()` in the shape each one takes. */
async function fillIn(form: FormCapability) {
  await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }); // text
  await form.setValue(toFieldRef('updates'), { checked: true }); // checkbox
  await form.setValue(toFieldRef('plan'), { value: 'yearly' }); // radio group: a button's value
  await form.setValue(toFieldRef('framework'), { value: 'React' }); // dropdown: an option's value
  return form.setValue(toFieldRef('topics'), { selectedValues: ['Forms', 'Signatures'] }); // list
}

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
    const at = (x: number, y: number, width: number, height: number) => ({
      page,
      rect: { x, y, width, height },
      ...look,
    });
    void (async () => {
      await form.create({ family: 'text', name: 'name', widgets: [at(72, 520, 220, 22)] });
      await form.create({
        family: 'combobox',
        name: 'framework',
        options: ['React', 'Vue', 'Svelte', 'Angular'].map((label) => ({ label, value: label })),
        widgets: [at(72, 552, 160, 22)],
      });
      await form.create({
        family: 'radio',
        name: 'plan',
        widgets: [
          { ...at(72, 588, 16, 16), exportValue: 'monthly' },
          { ...at(112, 588, 16, 16), exportValue: 'yearly' },
        ],
      });
      await form.create({ family: 'checkbox', name: 'updates', widgets: [at(72, 618, 16, 16)] });
      await form.create({
        family: 'listbox',
        name: 'topics',
        multiSelect: true,
        options: ['Forms', 'Annotations', 'Signatures'].map((label) => ({ label, value: label })),
        widgets: [at(320, 520, 150, 60)],
      });
      await fillIn(form);
      stage.goToPage(page);
    })();
  }, [form, stage, status, page]);
}

function FillToolbar() {
  useSignUpForm();
  const form = useForm();
  const [result, setResult] = useState('');

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        onClick={async () => {
          const { status } = await fillIn(form);
          setResult(`Filled in: ${status}`);
        }}
      >
        Fill in
      </button>
      <button
        type="button"
        className="button"
        onClick={async () => {
          // Plain values by full name, as your backend would send them.
          const { applied, skipped } = await form.importValues({
            name: 'Grace Hopper',
            framework: 'Vue',
            updates: false,
            topics: ['Annotations'],
            phone: '555-0100',
          });
          setResult(`${applied.length} filled, ${skipped.length} skipped`);
        }}
      >
        Fill from your backend
      </button>
      <button
        type="button"
        className="button"
        onClick={async () => {
          const { fields } = await form.reset();
          setResult(`${fields.length} fields reset`);
        }}
      >
        Reset
      </button>
      {result && <output className="readout">{result}</output>}
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <FillToolbar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <FormLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
