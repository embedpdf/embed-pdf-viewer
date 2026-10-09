import { useCallback, useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
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

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** The ebook has no form, so this adds one to its last page, with three required fields. */
function useSignUpForm(onReady: () => void) {
  const form = useForm();
  const status = useFormState((state) => state.status);
  const page = usePageList().at(-1)?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || !page || added.current) return;
    added.current = true;
    const at = (y: number, width = 240, height = 24) => ({ page, rect: { x: 72, y, width, height } });
    void (async () => {
      await form.create({
        family: 'text',
        name: 'name',
        required: true,
        widgets: [{ ...at(540), ...look }],
      });
      await form.create({
        family: 'text',
        name: 'email',
        required: true,
        widgets: [{ ...at(576), ...look }],
      });
      await form.create({ family: 'text', name: 'company', widgets: [{ ...at(612), ...look }] });
      await form.create({
        family: 'checkbox',
        name: 'terms',
        required: true,
        widgets: [{ ...at(650, 16, 16), ...look }],
      });
      await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
      onReady();
    })();
  }, [form, status, page, onReady]);
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
  useSignUpForm(submit);

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
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
