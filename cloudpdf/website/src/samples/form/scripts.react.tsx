import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { actionsPlugin } from '@embedpdf/react/actions';
import {
  FormLayer,
  formPlugin,
  toFieldRef,
  useFormEvent,
  useFormValue,
} from '@embedpdf/react/form';
import { cloudEngine } from '@cloudpdf/engine';

import './scripts.css';

const engine = cloudEngine();
// The form's scripts run with JavaScript on in the actions plugin.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  formPlugin(),
  actionsPlugin({ javascript: { enabled: true } }),
];

const invoice: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The amounts and the total are calculated by the form's scripts.
function InvoiceBar() {
  const total = useFormValue(toFieldRef('invoice.total'));
  const [refused, setRefused] = useState<string | null>(null);

  // A script refused a value, such as a date that isn't day/month/year.
  useFormEvent(
    (form) => form.onValidationRejected,
    ({ field, issues }) => setRefused(`${field.name}: ${issues[0]?.message ?? 'refused'}`),
  );

  return (
    <div className="toolbar">
      <output className="readout">
        Total: {total && 'value' in total && total.value ? total.value : 'type a quantity'}
      </output>
      {refused && <output className="refused">{refused}</output>}
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: invoice }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <InvoiceBar />
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
