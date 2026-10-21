import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin, useInteraction, useInteractionState } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { FormLayer, formPlugin, useForm, useFormState } from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './designer.css';

const engine = localEngine();
// Building forms needs the annotation plugin: in design mode, fields are boxes like any annotation.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
];

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const FIELD_TOOLS = [
  ['form-text', 'Text'],
  ['form-checkbox', 'Checkbox'],
  ['form-radio', 'Radio button'],
  ['form-combobox', 'Dropdown'],
  ['form-listbox', 'List'],
  ['form-signature', 'Signature'],
] as const;

/** Start on the form's last page, which is empty, with the text tool picked. */
function useStartDesigning() {
  const interaction = useInteraction();
  const stage = useStage();
  const page = usePageList().at(-1)?.ref;
  const started = useRef(false);

  useEffect(() => {
    if (!page || started.current) return;
    started.current = true;
    stage.goToPage(page);
    interaction.activateTool('form-text');
  }, [interaction, stage, page]);
}

function FieldPalette() {
  useStartDesigning();
  const interaction = useInteraction();
  const form = useForm();
  const { activeToolId } = useInteractionState();
  const { fields } = useFormState();
  // The pointer fills the form in; every other tool here designs it.
  const filling = activeToolId === 'pointer';

  if (!form.canDesign()) return <p className="readout">This document’s form can’t be changed.</p>;

  return (
    <div className="toolbar">
      <div className="segments">
        <button
          type="button"
          className="segment"
          aria-pressed={filling}
          onClick={() => interaction.activateTool('pointer')}
        >
          Fill in
        </button>
        <button
          type="button"
          className="segment"
          aria-pressed={!filling}
          onClick={() => interaction.activateTool('form-edit')}
        >
          Design
        </button>
      </div>
      {FIELD_TOOLS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className="button"
          aria-pressed={activeToolId === id}
          onClick={() => interaction.activateTool(id)}
        >
          {label}
        </button>
      ))}
      <output className="readout">
        {fields.length} fields: click the page to place another
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: forms }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <FieldPalette />
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
