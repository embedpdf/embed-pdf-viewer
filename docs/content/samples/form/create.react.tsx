import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, useForm } from '@embedpdf/react/form';
import type { FormCapability, FormFieldDTO } from '@embedpdf/react/form';
import type { PageRef } from '@embedpdf/react/runtime';
import { localEngine } from '@embedpdf/engine';

import './create.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#ffffff', strokeWidth: 1, fontSize: 11 };

/** A dropdown, the next row down the page. */
function addDropdown(form: FormCapability, page: PageRef, row: number) {
  return form.create({
    family: 'combobox',
    name: `country_${row + 1}`,
    options: [
      { label: 'Netherlands', value: 'NL' },
      { label: 'Belgium', value: 'BE' },
    ],
    widgets: [{ page, rect: { x: 96, y: 270 + row * 36, width: 160, height: 24 }, ...look }],
  });
}

/** A radio group: one field with a widget per button, each with the value it stands for. */
function addRadioGroup(form: FormCapability, page: PageRef, row: number) {
  const y = 274 + row * 36;
  return form.create({
    family: 'radio',
    name: `plan_${row + 1}`,
    widgets: [
      { page, rect: { x: 96, y, width: 16, height: 16 }, exportValue: 'monthly', ...look },
      { page, rect: { x: 136, y, width: 16, height: 16 }, exportValue: 'yearly', ...look },
    ],
  });
}

function BuildToolbar() {
  const form = useForm();
  const stage = useStage();
  // The form's last page is empty: room for new fields.
  const page = usePageList().at(-1)?.ref;
  const [added, setAdded] = useState<FormFieldDTO[]>([]);
  const started = useRef(false);

  useEffect(() => {
    if (!page || started.current) return;
    started.current = true;
    stage.goToPage(page);
  }, [stage, page]);

  // Each new field goes a row further down the page: bring it into view.
  const add = async (addField: typeof addDropdown) => {
    if (!page) return;
    const { field } = await addField(form, page, added.length);
    setAdded((fields) => [...fields, field]);
    stage.reveal(page, { rect: form.getWidget(field.widgets[0])!.rect });
  };

  const last = added.at(-1);
  const full = added.length >= 5;

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!page || full}
        onClick={() => void add(addDropdown)}
      >
        Add a dropdown
      </button>
      <button
        type="button"
        className="button"
        disabled={!page || full}
        onClick={() => void add(addRadioGroup)}
      >
        Add a radio group
      </button>
      <button
        type="button"
        className="button"
        disabled={!last}
        onClick={async () => {
          if (!last) return;
          await form.delete(last.ref);
          setAdded((fields) => fields.slice(0, -1));
        }}
      >
        Remove the last
      </button>
      <output className="readout">
        {added.map((field) => field.name).join(', ') || 'No fields on this page yet'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: forms }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <BuildToolbar />
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
