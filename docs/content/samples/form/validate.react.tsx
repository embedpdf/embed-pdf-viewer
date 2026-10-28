import { useCallback, useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, toFieldRef, useForm, useFormState } from '@embedpdf/react/form';
import type { FormValidation } from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './validate.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/** Fill in a name, then check the form, as if it was submitted. */
function useFilledInName(onReady: () => void) {
  const form = useForm();
  const status = useFormState((state) => state.status);
  const started = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || started.current) return;
    started.current = true;
    void form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }).then(onReady);
  }, [form, status, onReady]);
}

function SubmitToolbar() {
  const form = useForm();
  const stage = useStage();
  const [check, setCheck] = useState<FormValidation | null>(null);

  // Check the required fields, and take the reader to the first empty one.
  const submit = useCallback(() => {
    const result = form.validate();
    setCheck(result);
    // Where a field shows is its widget's row in the form.
    const first = result.missing[0]?.widgets[0];
    const widget = first ? form.getWidget(first) : null;
    if (widget) stage.reveal(widget.page, { rect: widget.rect });
  }, [form, stage]);
  useFilledInName(submit);

  return (
    <div className="toolbar">
      <button type="button" className="button" onClick={submit}>
        Submit
      </button>
      {check &&
        (check.valid ? (
          <output className="readout">Every required field is filled in</output>
        ) : (
          <output className="readout missing">
            Fill in first: {check.missing.map((field) => field.name).join(', ')}
          </output>
        ))}
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: forms }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SubmitToolbar />
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
