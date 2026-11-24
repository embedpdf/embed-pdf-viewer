import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, useForm } from '@embedpdf/react/form';
import type { FieldControl, FieldControlProps } from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './clear-button.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/**
 * A text box with a button at its end that empties it. `native` is the layer's own text box:
 * the field as the PDF draws it, and the editor people type in. The button is yours.
 */
function TextBox({ widget, native, setValue }: FieldControlProps) {
  const form = useForm();
  if (widget.control !== 'text') return null;

  // Empty the box, then put the cursor back in it, ready for the new value.
  const clear = () => setValue({ value: '' }).then(() => form.focus(widget.fieldRef));

  return (
    <>
      {native}
      {!widget.disabled && widget.value !== '' && (
        <button
          type="button"
          className="clear-button"
          aria-label={`Clear ${widget.label}`}
          tabIndex={-1} // Tab goes to the text box
          onClick={clear}
        />
      )}
    </>
  );
}

// The one-line text boxes get the button; the layer draws every other box.
const controls: FieldControl[] = [
  { for: (widget) => widget.control === 'text' && !widget.multiline, component: TextBox },
];

function Toolbar() {
  const form = useForm();
  const stage = useStage();

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        onClick={() =>
          form.importValues({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            company: 'Lanternfield',
          })
        }
      >
        Fill in
      </button>
      <button type="button" className="button" onClick={() => stage.zoomIn()}>
        Zoom in
      </button>
      <button type="button" className="button" onClick={() => stage.rotateViewBy(90)}>
        Turn the view
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: forms }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Toolbar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <FormLayer controls={controls} />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
