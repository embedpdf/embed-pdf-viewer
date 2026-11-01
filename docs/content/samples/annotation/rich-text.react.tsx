import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationProperties,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './rich-text.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

// [!doc-source notice]
const notice = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/notice.pdf');
  return { kind: 'bytes', id: 'notice', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// On load: the document's rich text box, selected.
function SelectRichText() {
  const annotation = useAnnotation();
  const stage = useStage();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const richText = annotation.list().find((each) => each.nm === 'rich-text');
    if (!richText) return;
    annotation.selection.set([richText.ref]);
    stage.reveal(richText.page, { rect: richText.rect });
  }, [annotation, stage, ready]);

  return null;
}

type Format = 'bold' | 'italic' | 'underline';

// The same calls style the selected words while typing, and the whole box otherwise.
function RichTextToolbar() {
  const annotation = useAnnotation();
  const { properties, values, mixed } = useAnnotationProperties();
  const hasText = properties.some((property) => property.control === 'textFormat');
  // On when every selected word has it; `mixed` lists what the words disagree on.
  const isOn = (format: Format) => values[format] === true && !mixed.includes(format);

  return (
    <div className="toolbar">
      {(['bold', 'italic', 'underline'] as const).map((format) => (
        <button
          key={format}
          type="button"
          className={`button ${format}`}
          aria-pressed={isOn(format)}
          disabled={!hasText}
          onClick={() => annotation.text.toggleFormat(format)}
        >
          {format[0]!.toUpperCase()}
        </button>
      ))}
      <button
        type="button"
        className="button"
        disabled={!hasText}
        onClick={() => annotation.selection.update({ fontColor: '#c00000' })}
      >
        Red
      </button>
      <button
        type="button"
        className="button"
        disabled={!hasText}
        onClick={() => annotation.selection.update({ fontSize: values.fontSize === 24 ? 16 : 24 })}
      >
        {values.fontSize === 24 ? '16 pt' : '24 pt'}
      </button>
      <p className="hint">Ctrl or Cmd with B, I or U works while you type</p>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: notice }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <SelectRichText />
        <RichTextToolbar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
