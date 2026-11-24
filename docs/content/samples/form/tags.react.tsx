import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { Anchored } from '@embedpdf/react/anchored';
import {
  FormLayer,
  formPlugin,
  useForm,
  useFormState,
  useFormWidgetAnchor,
} from '@embedpdf/react/form';
import type { FormField } from '@embedpdf/react/form';
import { localEngine } from '@embedpdf/engine';

import './tags.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/**
 * A tag beside the first box of a field: pinned, so it stays on the field. A pinned tag keeps
 * its size at every zoom, so this one is small: it fits in the page's margin on a phone too.
 */
function Tag({ field }: { field: FormField }) {
  const form = useForm();
  const anchor = useFormWidgetAnchor(form.getWidgets(field.ref)[0]?.ref ?? null);

  return (
    <Anchored anchor={anchor} placement="left" gap={6} pinned>
      <button
        type="button"
        className="tag"
        title="Required"
        aria-label={`Required: ${field.alternateName ?? field.name}`}
        onClick={() => form.focus(field.ref)}
      >
        !
      </button>
    </Anchored>
  );
}

/** A tag on every required field that is still empty. */
function RequiredTags() {
  const form = useForm();
  useFormState((state) => state.fields); // again when a field is filled in
  const { missing } = form.validate();

  return missing.map((field) => <Tag key={field.name} field={field} />);
}

/** The view's own controls: the tags follow the view when it zooms and turns. */
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
        <Stage className="stage" overlay={<RequiredTags />}>
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
