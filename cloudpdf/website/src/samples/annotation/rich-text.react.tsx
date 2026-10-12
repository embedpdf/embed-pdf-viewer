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
  useAnnotationProperties,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './rich-text.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// On load: a text box born with formatting, selected. Runs change the body only where they differ.
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
        interiorColor: '#fffbe6',
        richText: {
          body: { family: 'Helvetica', size: 16, color: '#1a2748' },
          paragraphs: [
            {
              runs: [
                { text: 'Double-click me, select a word, then make it ' },
                { text: 'bold', style: { weight: 700 } },
                { text: ' or ' },
                { text: 'red', style: { color: '#c00000' } },
                { text: '.' },
              ],
            },
          ],
        },
      },
      undefined,
      { select: true },
    );
  }, [annotation, ready, cover]);

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
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddTextBox />
        <RichTextToolbar />
        <Stage className="stage">
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
