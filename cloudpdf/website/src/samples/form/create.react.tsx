import { useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, useForm } from '@embedpdf/react/form';
import type { FormCapability, FormFieldDTO } from '@embedpdf/react/form';
import type { PageRef } from '@embedpdf/react/runtime';
import { cloudEngine } from '@cloudpdf/engine';

import './create.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const registration: OpenInput = { kind: 'share', shareToken: 'shr_sjOrUrwF2Sf0X5ADfySRG58L' };

// The printed boxes are the fields' look: a new field only sets its text size.
const look = { fontSize: 11 };

// The printed table of group tickets: a row every 36 points from the top at 470, with a country
// box at x 96 and a circle for each ticket at x 330 and 430.
const rowTop = (row: number) => 470 + row * 36;

/** A dropdown in a row's country box. */
function addDropdown(form: FormCapability, page: PageRef, row: number) {
  return form.create({
    family: 'combobox',
    name: `country_${row + 1}`,
    options: [
      { label: 'Netherlands', value: 'NL' },
      { label: 'Belgium', value: 'BE' },
      { label: 'Germany', value: 'DE' },
    ],
    widgets: [{ page, rect: { x: 96, y: rowTop(row), width: 160, height: 24 }, ...look }],
  });
}

/** A radio group in a row's two circles: one field, a widget per circle, each with its value. */
function addRadioGroup(form: FormCapability, page: PageRef, row: number) {
  const y = rowTop(row) + 4;
  return form.create({
    family: 'radio',
    name: `ticket_${row + 1}`,
    widgets: [
      { page, rect: { x: 330, y, width: 16, height: 16 }, exportValue: 'one-day', ...look },
      { page, rect: { x: 430, y, width: 16, height: 16 }, exportValue: 'both-days', ...look },
    ],
  });
}

function BuildToolbar() {
  const form = useForm();
  const stage = useStage();
  const page = usePageList()[0]?.ref; // the printed form
  const [added, setAdded] = useState<FormFieldDTO[]>([]);

  // Each kind of field fills its column from the top: the next row that hasn't got one.
  const rowFor = (family: FormFieldDTO['family']) =>
    added.filter((field) => field.family === family).length;

  const add = async (addField: typeof addDropdown, family: FormFieldDTO['family']) => {
    if (!page) return;
    const { field } = await addField(form, page, rowFor(family));
    setAdded((fields) => [...fields, field]);
    stage.reveal(page, { rect: form.getWidget(field.widgets[0])!.rect });
  };

  const last = added.at(-1);

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={!page || rowFor('combobox') >= 5}
        onClick={() => void add(addDropdown, 'combobox')}
      >
        Add a dropdown
      </button>
      <button
        type="button"
        className="button"
        disabled={!page || rowFor('radio') >= 5}
        onClick={() => void add(addRadioGroup, 'radio')}
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
        {added.map((field) => field.name).join(', ') || 'No fields in the table yet'}
      </output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: registration }]}>
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
