import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
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

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/** On load: a name filled in. */
function useFilledInName() {
  const form = useForm();
  const status = useFormState((state) => state.status);
  const started = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || started.current) return;
    started.current = true;
    void form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
  }, [form, status]);
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
  useFilledInName();
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: forms }]}>
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
