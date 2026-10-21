import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationState,
  useRichTextEditor,
  type AnnotationRenderer,
  type AnnotationRendererProps,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './branded-text-box.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// Your own text box, in your app's look: it fills its frame, which the layer
// places and turns like the text box. The element inside is the editor and
// fills the box, so the box draws the fill, border and padding.
function BrandedTextBox({ annotation }: AnnotationRendererProps) {
  const editor = useRichTextEditor(annotation);

  return (
    <div className={editor.editing ? 'text-box editing' : 'text-box'}>
      <div ref={editor.ref} style={editor.style} />
    </div>
  );
}

const RENDERERS: AnnotationRenderer[] = [
  { for: (annotation) => annotation.subtype === 'free-text', component: BrandedTextBox },
];

// On load: the document's text box, selected, drawn by your component.
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

// The formatting calls work on your element as they do on the built-in one.
function FormatButtons() {
  const annotation = useAnnotation();
  const hasText = useAnnotationState((state) =>
    state.selected.some((selected) => selected.subtype === 'free-text'),
  );

  return (
    <div className="toolbar">
      {(['bold', 'italic', 'underline'] as const).map((format) => (
        <button
          key={format}
          type="button"
          className={`button ${format}`}
          disabled={!hasText}
          onClick={() => annotation.text.toggleFormat(format)}
        >
          {format[0]!.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: review }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectTextBox />
        <FormatButtons />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <AnnotationLayer renderers={RENDERERS} />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
