import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { FormLayer, formPlugin, useForm, useFormSettings } from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './colors.css';

const engine = localEngine();
// The colors the viewer draws around fields; `null` follows the viewer's accent.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  formPlugin({ fields: { border: '#ea580c' } }),
];

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const COLORS = [
  ['Accent', null],
  ['Orange', '#ea580c'],
  ['Green', '#16a34a'],
] as const;

function ColorToolbar() {
  const form = useForm();
  const settings = useFormSettings();

  return (
    <div className="toolbar">
      <span className="label">Edges</span>
      <div className="segments">
        {COLORS.map(([label, color]) => (
          <button
            key={label}
            type="button"
            className="segment"
            aria-pressed={settings.fields.border === color}
            onClick={() => form.updateSettings({ fields: { border: color } })}
          >
            {label}
          </button>
        ))}
      </div>
      <span className="label">Focus</span>
      <div className="segments">
        {COLORS.map(([label, color]) => (
          <button
            key={label}
            type="button"
            className="segment"
            aria-pressed={settings.focus.color === color}
            onClick={() => form.updateSettings({ focus: { color } })}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: forms }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ColorToolbar />
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
