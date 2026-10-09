import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
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

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// On load: a rectangle and a text box on the cover, the text box selected so the menu shows.
function AddAnnotations() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void annotation.create(cover, {
      subtype: 'square',
      box: { x: 96, y: 506, width: 178, height: 54 },
      color: '#1e90ff',
      strokeWidth: 3,
    });
    void annotation.create(
      cover,
      {
        subtype: 'free-text',
        box: { x: 300, y: 512, width: 230, height: 40 },
        contents: 'Ready for review',
        fontSize: 16,
        fontColor: '#1a2748',
        interiorColor: '#fffbe6',
      },
      undefined,
      { select: true },
    );
  }, [annotation, ready, cover]);

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddAnnotations />
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
