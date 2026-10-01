import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin, useInteraction } from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import { commandsPlugin, standardCommands } from '@embedpdf/react/commands';
import type { ResolvedCommand } from '@embedpdf/react/commands';
import { Toolbar, group } from '@embedpdf/react/toolbar';
import type { BarSchema } from '@embedpdf/react/toolbar';
import { localEngine } from '@embedpdf/engine';

import './modes.css';

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

// A bar per mode.
const viewBar: BarSchema = {
  id: 'view',
  sections: {
    start: [group('tools', ['tool:pointer', 'tool:pan'])],
    center: [
      group('pages', ['page:previous', 'page:next']),
      group('zoom', ['zoom:out', 'zoom:in']),
    ],
  },
};

const annotateBar: BarSchema = {
  id: 'annotate',
  sections: {
    start: [group('markup', ['tool:highlight', 'tool:underline', 'tool:strikeout'])],
    center: [group('draw', ['tool:ink', 'tool:square', 'tool:circle', 'tool:note'])],
    end: [group('edit', ['annotation:delete'])],
  },
};

type Mode = 'view' | 'annotate';
const BARS: Record<Mode, BarSchema> = { view: viewBar, annotate: annotateBar };
const TOOL_OF_MODE: Record<Mode, string> = { view: 'pointer', annotate: 'highlight' };

const renderCommand = (command: ResolvedCommand, _variant: string, run: () => void) => (
  <button
    type="button"
    className="button"
    disabled={!command.enabled}
    aria-pressed={command.active}
    onClick={run}
  >
    {command.label}
  </button>
);

function ModeToolbar() {
  const interaction = useInteraction();
  const [mode, setMode] = useState<Mode>('view');

  // Each mode starts with its own tool.
  const switchTo = (next: Mode) => {
    setMode(next);
    interaction.activateTool(TOOL_OF_MODE[next]);
  };

  return (
    <div className="chrome">
      <div className="modes" role="tablist" aria-label="Mode">
        {(['view', 'annotate'] as const).map((each) => (
          <button
            key={each}
            type="button"
            role="tab"
            className="mode"
            aria-selected={mode === each}
            onClick={() => switchTo(each)}
          >
            {each === 'view' ? 'View' : 'Annotate'}
          </button>
        ))}
      </div>
      <Toolbar bar={BARS[mode]} className="toolbar" renderCommand={renderCommand} />
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ModeToolbar />
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
