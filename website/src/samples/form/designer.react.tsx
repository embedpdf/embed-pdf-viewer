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

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const FIELD_TOOLS = [
  ['form-text', 'Text'],
  ['form-checkbox', 'Checkbox'],
  ['form-radio', 'Radio button'],
  ['form-combobox', 'Dropdown'],
  ['form-listbox', 'List'],
  ['form-signature', 'Signature'],
] as const;

/** Start on the ebook's last page, which has room for a form, with the text tool picked. */
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

  if (!form.canDesign()) return <p className="readout">This document's form can't be changed.</p>;

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
        {fields.length === 0 ? 'Click the page to place a field' : `${fields.length} fields`}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
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
