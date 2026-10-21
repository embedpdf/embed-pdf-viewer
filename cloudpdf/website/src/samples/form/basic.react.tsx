import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, useFormState } from '@embedpdf/react/form';
import { cloudEngine } from '@cloudpdf/engine';

import './basic.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const forms: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

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

function FormToolbar() {
  useStartOnSignUp();
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
