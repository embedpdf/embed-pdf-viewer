import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { commandsPlugin, standardCommands } from '@embedpdf/react/commands';
import { Toolbar, group, item } from '@embedpdf/react/toolbar';
import type { BarSchema } from '@embedpdf/react/toolbar';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
  commandsPlugin({ commands: standardCommands }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Your icons, by the names the standard commands give them.
const ICONS: Record<string, string> = {
  'previous-page': '‹',
  'next-page': '›',
  'zoom-out': '−',
  'zoom-in': '+',
  'fit-width': '↔',
  pointer: '↖',
  pan: '✥',
  highlight: '▍',
  underline: 'U̲',
  ink: '〰',
  download: '↓',
  print: '⎙',
};

const bar: BarSchema = {
  id: 'main',
  sections: {
    start: [group('pages', ['page:previous', 'page:next'])],
    center: [
      group('zoom', [
        'zoom:out',
        item('zoom:in', { variants: ['icon+label', 'icon'] }),
        item('zoom:fit-width', { variants: ['icon+label', 'icon'], importance: 2 }),
      ]),
    ],
    end: [
      group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight', 'tool:underline', 'tool:ink'], {
        collapse: 'menu',
      }),
      group('document', [item('document:download', { importance: 5 }), 'document:print']),
    ],
  },
};

function MainToolbar() {
  return (
    <Toolbar
      bar={bar}
      className="toolbar"
      renderCommand={(command, variant, run) => (
        <button
          type="button"
          className="button"
          title={command.label}
          aria-label={command.label}
          disabled={!command.enabled}
          aria-pressed={command.active}
          onClick={run}
        >
          <span className="icon" aria-hidden>
            {ICONS[command.icon ?? ''] ?? command.label.charAt(0)}
          </span>
          {variant === 'icon+label' && <span>{command.label}</span>}
        </button>
      )}
    />
  );
}

export default function App() {
  // Narrow the toolbar to watch it make room: labels go first, then the tools fold, then "More".
  const [width, setWidth] = useState(100);

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <label className="width">
          Toolbar width
          <input
            type="range"
            min={30}
            max={100}
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
          <output>{width}%</output>
        </label>
        <div className="frame" style={{ width: `${width}%` }}>
          <MainToolbar />
        </div>
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer annotations={false} />
              <SelectionLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
