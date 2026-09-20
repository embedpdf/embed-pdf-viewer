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
  useSelectionProps,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import {
  Button,
  Demo,
  Readout,
  Spacer,
  StageFrame,
  Toolbar,
  stageFill,
} from '../stage/_shared/chrome';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

type Format = 'bold' | 'italic' | 'underline';

function RichTextToolbar() {
  const annotation = useAnnotation();
  // The selection's editable properties: while the text editor holds a range
  // these describe the RANGE (bold true = every selected run is bold, `mixed`
  // when they disagree); otherwise the selected boxes' body style.
  const props = useSelectionProps();
  const { currentPage } = usePages();
  const { pages } = usePageList();
  const page = pages[currentPage];
  const [status, setStatus] = useState('');

  // A text box born with formatting: runs override the body only where they
  // differ from it. `contents` becomes the plain projection automatically.
  const addTextBox = async () => {
    if (!page) return;
    const ref = await annotation.create(page.ref, {
      subtype: 'free-text',
      intent: 'free-text',
      rect: { left: 60, bottom: 640, right: 400, top: 700 },
      fontFamily: 'helvetica',
      fontSize: 16,
      textAlign: 'left',
      color: { r: 30, g: 30, b: 30 },
      interiorColor: { r: 255, g: 250, b: 205 },
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
    });
    annotation.select(ref);
    setStatus('added — double-click the box to edit its text');
  };

  const hasText = props.specs.some((spec) => spec.key === 'bold');
  const isOn = (format: Format) => props.values[format] === true && !props.mixed.includes(format);

  return (
    <Toolbar>
      <Button onClick={() => void addTextBox()} disabled={!page}>
        Add text box
      </Button>
      {(['bold', 'italic', 'underline'] as const).map((format) => (
        <Button
          key={format}
          title={`${format} — the selected text while editing, else the whole box`}
          disabled={!hasText}
          // The plugin flips the state it reports: the range's runs while the
          // editor holds a selection, the body otherwise (also Ctrl/Cmd+B/I/U).
          onClick={() => annotation.toggleTextFormat(format)}
        >
          {isOn(format) ? '● ' : ''}
          {format}
        </Button>
      ))}
      <Button
        title="Font size: the same routing — the range, else the box"
        disabled={!hasText}
        onClick={() =>
          annotation.updateSelection({ fontSize: props.values.fontSize === 24 ? 16 : 24 })
        }
      >
        {props.values.fontSize === 24 ? '16 pt' : '24 pt'}
      </Button>
      <Spacer />
      <Readout>{status}</Readout>
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <RichTextToolbar />
          <StageFrame height={420}>
            <Stage style={stageFill}>
              {() => (
                <>
                  <RenderLayer annotations={false} />
                  <AnnotationLayer />
                </>
              )}
            </Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
