import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, toFieldRef, useForm } from '@embedpdf/react/form';
import type { FormCapability } from '@embedpdf/react/form';
import { cloudEngine } from '@cloudpdf/engine';

import './fill.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const forms: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

/** One field of each family, with `setValue()` in the shape each one takes. */
async function fillIn(form: FormCapability) {
  await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }); // text
  await form.setValue(toFieldRef('updates'), { checked: true }); // checkbox
  await form.setValue(toFieldRef('plan'), { value: 'yearly' }); // radio group: a button's value
  await form.setValue(toFieldRef('framework'), { value: 'React' }); // dropdown: an option's value
  return form.setValue(toFieldRef('topics'), { selectedValues: ['Forms', 'Signatures'] }); // list
}

/** Start on the sign-up page, the form's first fields. */
function useStartOnSignUp() {
  const stage = useStage();
  const page = usePageList()[1]?.ref;
  const started = useRef(false);

  useEffect(() => {
    if (!page || started.current) return;
    started.current = true;
    stage.goToPage(page);
  }, [stage, page]);
}

function FillToolbar() {
  useStartOnSignUp();
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: forms }]}>
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
