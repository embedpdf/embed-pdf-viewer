import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, useFormState } from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};

function FormToolbar() {
  const { fields } = useFormState();

  return (
    <div className="toolbar">
      <output className="readout">{fields.length} fields: click one and fill it in</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: forms }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <FormToolbar />
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
