import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  FormLayer,
  formPlugin,
  useForm,
  useFormSettings,
  useFormState,
} from '@embedpdf/react/form';
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

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const COLORS = [
  ['Accent', null],
  ['Orange', '#ea580c'],
  ['Green', '#16a34a'],
] as const;

/** The ebook has no form, so this adds one to its last page: fields with no border of their own. */
function useSignUpForm() {
  const form = useForm();
  const stage = useStage();
  const status = useFormState((state) => state.status);
  const page = usePageList().at(-1)?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || !page || added.current) return;
    added.current = true;
    const at = (y: number, width = 240, height = 24) => ({ page, rect: { x: 72, y, width, height } });
    void (async () => {
      await form.create({ family: 'text', name: 'name', widgets: [{ ...at(540), fontSize: 11 }] });
      await form.create({ family: 'text', name: 'email', widgets: [{ ...at(576), fontSize: 11 }] });
      await form.create({ family: 'checkbox', name: 'updates', widgets: [at(614, 16, 16)] });
      stage.goToPage(page);
    })();
  }, [form, stage, status, page]);
}

function ColorToolbar() {
  useSignUpForm();
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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
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
