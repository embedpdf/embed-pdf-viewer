import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin, useInteraction } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin, useAnnotation } from '@embedpdf/react/annotation';
import { FormLayer, formPlugin, toFieldRef, useForm, useFormState } from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './field-settings.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
];

const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};

/** On load: design mode, with the name field selected. */
function useDesignForm() {
  const form = useForm();
  const annotation = useAnnotation();
  const interaction = useInteraction();
  const status = useFormState((state) => state.status);
  const started = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || started.current) return;
    started.current = true;
    interaction.activateTool('form-edit');
    const widget = form.get(toFieldRef('name'))?.widgets[0]?.ref;
    if (widget) annotation.selection.set([widget]);
  }, [form, annotation, interaction, status]);
}

/** What a settings panel shows for the selected field, and changes with `update()`. */
function FieldSettings() {
  useDesignForm();
  const form = useForm();
  const { selectedField: field } = useFormState();

  if (!field) return <p className="panel hint">Select a field on the page.</p>;

  return (
    <div className="panel">
      <label className="setting">
        Name
        <input
          key={field.name}
          className="input"
          defaultValue={field.name}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name && name !== field.name) void form.update(field.ref, { name });
          }}
        />
      </label>
      <label className="setting">
        Tooltip
        <input
          key={`${field.name}:tooltip`}
          className="input"
          defaultValue={field.alternateName ?? ''}
          onBlur={(event) =>
            void form.update(field.ref, { alternateName: event.target.value || null })
          }
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(event) => void form.update(field.ref, { required: event.target.checked })}
        />
        Required
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={field.readOnly}
          onChange={(event) => void form.update(field.ref, { readOnly: event.target.checked })}
        />
        Read-only
      </label>
      <button type="button" className="button" onClick={() => void form.delete(field.ref)}>
        Remove the field
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: forms }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <AnnotationLayer />
                <FormLayer />
              </>
            )}
          </Stage>
          <FieldSettings />
        </div>
      </DocumentGate>
    </Viewer>
  );
}
