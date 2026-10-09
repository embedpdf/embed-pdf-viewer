import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  FormLayer,
  formPlugin,
  toFieldRef,
  useForm,
  useFormEvent,
  useFormState,
  useFormValue,
} from '@embedpdf/react/form';
import type { FormFieldDTO } from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './read.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** The ebook has no form, so this adds one to its last page, fills in a name, and goes there. */
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
      await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
      stage.goToPage(page);
    })();
  }, [form, stage, status, page]);
}

/** A field's value as text, whatever its family. */
function valueText(field: FormFieldDTO): string {
  switch (field.family) {
    case 'text':
    case 'combobox':
      return field.value || '—';
    case 'checkbox':
      return field.checked ? 'checked' : 'not checked';
    case 'radio':
      return field.value === 'Off' ? '—' : field.value;
    case 'listbox':
      return field.selectedValues.join(', ') || '—';
    default:
      return '';
  }
}

function Greeting() {
  useSignUpForm();
  const name = useFormValue(toFieldRef('name'));
  const [changed, setChanged] = useState<string | null>(null);

  // Every change, whoever made it: typing, a script, or code.
  useFormEvent(
    (form) => form.onValueChanged,
    ({ field }) => setChanged(field.name),
  );

  return (
    <div className="toolbar">
      <output className="readout">
        Hello, {name && 'value' in name && name.value ? name.value : 'stranger'}
      </output>
      {changed && <output className="note">Last change: {changed}</output>}
    </div>
  );
}

function FieldList() {
  const { fields } = useFormState();

  return (
    <ul className="fields">
      {fields.map((field) => (
        <li key={field.name} className="field">
          <span className="field-name">
            {field.name} <span className="family">{field.family}</span>
          </span>
          <span className="field-value">{valueText(field)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Greeting />
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <FormLayer />
              </>
            )}
          </Stage>
          <FieldList />
        </div>
      </DocumentGate>
    </Viewer>
  );
}
