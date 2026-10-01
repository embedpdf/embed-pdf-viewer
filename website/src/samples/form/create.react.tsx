import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, useForm, useFormState } from '@embedpdf/react/form';
import type { FormCapability } from '@embedpdf/react/form';
import type { PageRef } from '@embedpdf/react/runtime';
import { localEngine } from '@embedpdf/engine';

import './create.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** A dropdown, the next row down the page. */
function addDropdown(form: FormCapability, page: PageRef, row: number) {
  return form.create({
    family: 'combobox',
    name: `country_${row + 1}`,
    options: [
      { label: 'Netherlands', value: 'NL' },
      { label: 'Belgium', value: 'BE' },
    ],
    widgets: [{ page, rect: { x: 72, y: 520 + row * 36, width: 160, height: 24 }, ...look }],
  });
}

/** A radio group: one field with a widget per button, each with the value it stands for. */
function addRadioGroup(form: FormCapability, page: PageRef, row: number) {
  const y = 524 + row * 36;
  return form.create({
    family: 'radio',
    name: `plan_${row + 1}`,
    widgets: [
      { page, rect: { x: 72, y, width: 16, height: 16 }, exportValue: 'monthly', ...look },
      { page, rect: { x: 112, y, width: 16, height: 16 }, exportValue: 'yearly', ...look },
    ],
  });
}

function BuildToolbar() {
  const form = useForm();
  const stage = useStage();
  const { status, fields } = useFormState();
  const page = usePageList().at(-1)?.ref;
  const added = useRef(false);

  // The ebook has no form: start with a dropdown on its last page, which has room.
  useEffect(() => {
    if (status !== 'ready' || !page || added.current) return;
    added.current = true;
    void addDropdown(form, page, 0).then(({ field }) =>
      stage.reveal(page, { rect: field.widgets[0].rect }),
    );
  }, [form, stage, status, page]);

  // Each new field goes a row further down the page: bring it into view.
  const add = (addField: typeof addDropdown) => {
    if (!page) return;
    void addField(form, page, fields.length).then(({ field }) =>
      stage.reveal(page, { rect: field.widgets[0].rect }),
    );
  };

  const last = fields.at(-1);
  const full = fields.length >= 5;

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!page || full}
        onClick={() => add(addDropdown)}
      >
        Add a dropdown
      </button>
      <button
        type="button"
        className="button"
        disabled={!page || full}
        onClick={() => add(addRadioGroup)}
      >
        Add a radio group
      </button>
      <button
        type="button"
        className="button"
        disabled={!last}
        onClick={() => last && void form.delete(last.ref)}
      >
        Remove the last
      </button>
      <output className="readout">{fields.map((field) => field.name).join(', ') || 'No fields'}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
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
