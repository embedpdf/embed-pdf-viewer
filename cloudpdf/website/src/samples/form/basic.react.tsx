import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, useFormState } from '@embedpdf/react/form';
import { cloudEngine } from '@cloudpdf/engine';

import './basic.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const forms: OpenInput = { kind: 'grant', grant: 'shr_eBRW5E3MpolzD8G36Alp30EF' };

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
