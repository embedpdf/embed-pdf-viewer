import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin } from '@embedpdf/react/form';
import type { FieldControl, FieldControlProps } from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './controls.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/** A checkbox as a switch. A click fills the field in, as a click on the checkbox would. */
function Switch({ widget, setValue }: FieldControlProps) {
  if (widget.control !== 'toggle') return null;

  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={widget.checked}
      aria-label={widget.label}
      disabled={widget.disabled}
      onClick={() => setValue({ checked: !widget.checked })}
    />
  );
}

// The first control that matches a box draws it; the layer draws every other box.
const controls: FieldControl[] = [
  { for: (widget) => widget.control === 'toggle' && widget.kind === 'checkbox', component: Switch },
];

/** The view's own controls: the switches follow the view when it zooms and turns. */
function ViewButtons() {
  const stage = useStage();

  return (
    <div className="toolbar">
      <button type="button" className="button" onClick={() => stage.zoomOut()}>
        Zoom out
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
        <ViewButtons />
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
