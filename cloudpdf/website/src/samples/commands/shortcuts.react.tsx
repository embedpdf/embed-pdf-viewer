import { useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  commandsPlugin,
  formatShortcut,
  standardCommands,
  useCommand,
  useCommandShortcuts,
  useCommands,
  useCommandsEvent,
} from '@embedpdf/react/commands';
import { cloudEngine } from '@cloudpdf/engine';

import './shortcuts.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  commandsPlugin({ commands: standardCommands }),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// One row of the sheet: the key, and what it does. A command that can't run now is greyed out.
function ShortcutRow({ id, shortcut }: { id: string; shortcut: string }) {
  const command = useCommand(id);
  if (!command?.visible) return null;

  return (
    <li className="row" data-disabled={!command.enabled || undefined}>
      <kbd className="key">{formatShortcut(shortcut)}</kbd>
      <span>{command.label}</span>
    </li>
  );
}

// The sheet lists every shortcut, and shows the last command a key ran.
function KeyboardHelp() {
  const commands = useCommands();
  const [last, setLast] = useState<string | null>(null);

  useCommandsEvent(
    (commands) => commands.onExecuted,
    ({ commandId }) => setLast(commands.resolveCommand(commandId)?.label ?? commandId),
  );

  return (
    <aside className="sheet">
      <p className="status">
        {last ? `Ran: ${last}` : 'Click the viewer, then press a key, such as → for the next page'}
      </p>
      <ul className="rows">
        {commands.listShortcuts().map(({ commandId, shortcut }) => (
          <ShortcutRow key={`${commandId} ${shortcut}`} id={commandId} shortcut={shortcut} />
        ))}
      </ul>
    </aside>
  );
}

// The keys work while focus is inside this viewer, so they leave the rest of the page alone. A
// click anywhere in it gives it focus: `tabIndex={-1}` makes it a place for keys, not a stop in the
// Tab order.
function ShortcutArea() {
  const area = useRef<HTMLDivElement>(null);
  useCommandShortcuts({ target: area });
  return (
    <div ref={area} className="layout" tabIndex={-1}>
      <KeyboardHelp />
      <Stage className="stage">{() => <RenderLayer />}</Stage>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <ShortcutArea />
      </DocumentGate>
    </Viewer>
  );
}
