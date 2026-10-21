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
import { cloudEngine } from '@cloudpdf/engine';

import './read.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const forms: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

/** Start on the sign-up page, with a name filled in. */
function useStartOnSignUp() {
  const form = useForm();
  const stage = useStage();
  const status = useFormState((state) => state.status);
  const page = usePageList()[1]?.ref;
  const started = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || !page || started.current) return;
    started.current = true;
    stage.goToPage(page);
    void form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
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
  useStartOnSignUp();
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
