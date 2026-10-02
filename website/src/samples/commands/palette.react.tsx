import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  commandsPlugin,
  standardCommands,
  useCommand,
  useCommands,
} from '@embedpdf/react/commands';
import { localEngine } from '@embedpdf/engine';

import './palette.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  commandsPlugin({ commands: standardCommands }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// A result: its row follows the command, so it greys out the moment the command can't run.
function Result({ id }: { id: string }) {
  const command = useCommand(id);
  if (!command) return null;

  return (
    <li>
      <button type="button" className="result" disabled={!command.enabled} onClick={command.run}>
        <span>{command.label}</span>
        {command.shortcut && <kbd className="shortcut">{command.shortcut}</kbd>}
      </button>
    </li>
  );
}

function CommandPalette() {
  const commands = useCommands();
  const [query, setQuery] = useState('page');
  const results = commands.searchCommands(query);

  return (
    <div className="palette">
      <input
        className="field"
        type="search"
        aria-label="Search commands"
        placeholder="Type a command…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          // Enter runs the first result that can run now.
          const first = results.find((command) => commands.canExecute(command.id));
          if (event.key === 'Enter' && first) void commands.execute(first.id);
        }}
      />
      <ul className="results">
        {results.map((command) => (
          <Result key={command.id} id={command.id} />
        ))}
        {results.length === 0 && <li className="empty">No command matches</li>}
      </ul>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="layout">
          <CommandPalette />
          <Stage className="stage">{() => <RenderLayer />}</Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}
