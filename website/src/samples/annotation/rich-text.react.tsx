import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, usePageList, usePages } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useSelectionFields,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './rich-text.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

type Format = 'bold' | 'italic' | 'underline';

function RichTextToolbar() {
  const annotation = useAnnotation();
  // The selection's editable fields: while the text editor holds a range
  // these describe the whole range (bold true = every selected run is bold, `mixed`
  // when they disagree); otherwise the selected boxes' body style.
  const props = useSelectionFields();
  const { currentPage } = usePages();
  const { pages } = usePageList();
  const page = pages[currentPage];
  const [status, setStatus] = useState('');

  // A text box born with formatting: runs override the body only where they
  // differ from it. `contents` becomes the plain projection automatically.
  const addTextBox = async () => {
    if (!page) return;
    await annotation.create(
      page.ref,
      {
        subtype: 'free-text',
        intent: 'free-text',
        box: { x: 60, y: 90, width: 340, height: 60 },
        fontFamily: 'helvetica',
        fontSize: 16,
        textAlign: 'left',
        color: '#1e1e1e',
        interiorColor: '#fffacd',
        richText: {
          body: { family: 'Helvetica', size: 16 },
          paragraphs: [
            {
              runs: [
                { text: 'Double-click me, select a word, then make it ' },
                { text: 'bold', style: { weight: 700 } },
                { text: '.' },
              ],
            },
          ],
        },
      },
      undefined,
      { select: true },
    );
    setStatus('added — double-click the box to edit its text');
  };

  const hasText = props.fields.some((spec) => spec.key === 'bold');
  const isOn = (format: Format) => props.values[format] === true && !props.mixed.includes(format);

  return (
    <div className="toolbar">
      <button type="button" className="button" onClick={() => void addTextBox()} disabled={!page}>
        Add text box
      </button>
      {(['bold', 'italic', 'underline'] as const).map((format) => (
        <button
          type="button"
          className="button"
          key={format}
          title={`${format} — the selected text while editing, else the whole box`}
          disabled={!hasText}
          // The plugin flips the state it reports: the range's runs while the
          // editor holds a selection, the body otherwise (also Ctrl/Cmd+B/I/U).
          onClick={() => annotation.toggleTextFormat(format)}
        >
          {isOn(format) ? '● ' : ''}
          {format}
        </button>
      ))}
      <button
        type="button"
        className="button"
        title="Font size: the same routing — the range, else the box"
        disabled={!hasText}
        onClick={() =>
          annotation.updateSelection({ fontSize: props.values.fontSize === 24 ? 16 : 24 })
        }
      >
        {props.values.fontSize === 24 ? '16 pt' : '24 pt'}
      </button>
      <span className="spacer" />
      <output className="readout">{status}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <RichTextToolbar />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer annotations={false} />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
