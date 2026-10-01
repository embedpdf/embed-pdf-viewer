import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
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
import { cloudEngine } from '@cloudpdf/engine';

import './branded-text-box.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Your own text box: the element is the editor, in your app's look. It fills
// its frame, which the layer places and turns like the text box.
function BrandedTextBox({ annotation }: AnnotationRendererProps) {
  const editor = useRichTextEditor(annotation);

  return (
    <div
      ref={editor.ref}
      className={editor.editing ? 'text-box editing' : 'text-box'}
      style={editor.style}
    />
  );
}

const RENDERERS: AnnotationRenderer[] = [
  { for: (annotation) => annotation.subtype === 'free-text', component: BrandedTextBox },
];

// On load: a text box on the cover, selected.
function AddTextBox() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void annotation.create(
      cover,
      {
        subtype: 'free-text',
        box: { x: 106, y: 570, width: 380, height: 60 },
        contents: 'Double-click to type in your own text box',
        fontSize: 16,
        fontColor: '#1a2748',
      },
      undefined,
      { select: true },
    );
  }, [annotation, ready, cover]);

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddTextBox />
        <FormatButtons />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer annotations={false} />
              <AnnotationLayer renderers={RENDERERS} />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
