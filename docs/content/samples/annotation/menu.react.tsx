import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  AnnotationMenu,
  annotationPlugin,
  useAnnotation,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './menu.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// On load: the document's text box, selected, so its menu shows.
function SelectTextBox() {
  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const textBox = annotation.list().find((each) => each.nm === 'text-box');
    if (!textBox) return;
    annotation.selection.set([textBox.ref]);
    stage.reveal(textBox.page, { rect: textBox.rect });
  }, [annotation, stage, ready]);

  return null;
}

// What's in the menu depends on what's selected: text boxes get Bold and Edit.
function SelectionActions() {
  const annotation = useAnnotation();
  const { selected } = useAnnotationState();
  const allText = selected.every((a) => a.subtype === 'free-text');
  const [first] = selected;

  return (
    <div className="menu" role="toolbar" aria-label="Selection">
      {allText && (
        <button type="button" onClick={() => annotation.text.toggleFormat('bold')}>
          Bold
        </button>
      )}
      {allText && selected.length === 1 && first && (
        <button type="button" onClick={() => annotation.text.begin(first.ref)}>
          Edit text
        </button>
      )}
      <button type="button" onClick={() => annotation.selection.update({ color: '#dc143c' })}>
        Red
      </button>
      <button type="button" onClick={() => annotation.selection.delete()}>
        Delete
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: review }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectTextBox />
        <Stage
          className="stage"
          overlay={
            <AnnotationMenu placement="bottom">
              <SelectionActions />
            </AnnotationMenu>
          }
        >
          {() => (
            <>
              <RenderLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
