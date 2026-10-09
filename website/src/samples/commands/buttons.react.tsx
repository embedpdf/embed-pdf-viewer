import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { commandsPlugin, standardCommands, useCommand } from '@embedpdf/react/commands';
import { localEngine } from '@embedpdf/engine';

import './buttons.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), commandsPlugin({ commands: standardCommands })];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// One button, drawn from its command: the label, the shortcut, and whether it can run now.
function CommandButton({ id }: { id: string }) {
  const command = useCommand(id);
  if (!command?.visible) return null;

  return (
    <button
      type="button"
      className="button"
      title={command.label}
      disabled={!command.enabled}
      aria-pressed={command.active}
      onClick={command.run}
    >
      {command.label}
      {command.shortcut && <kbd className="shortcut">{command.shortcut}</kbd>}
    </button>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="toolbar">
          <CommandButton id="page:previous" />
          <CommandButton id="page:next" />
          <CommandButton id="zoom:out" />
          <CommandButton id="zoom:in" />
          <CommandButton id="zoom:fit-width" />
          <CommandButton id="view:rotate-clockwise" />
          <CommandButton id="document:download" />
        </div>
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
