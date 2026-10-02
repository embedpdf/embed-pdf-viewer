import { useEffect } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, StageToken, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  commandsPlugin,
  standardCommands,
  useCommand,
  useCommands,
  useCommandsSettings,
} from '@embedpdf/react/commands';
import type { CommandDef } from '@embedpdf/react/commands';
import { cloudEngine } from '@cloudpdf/engine';

import './custom.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });

// A command of your own: pressed while the pages show two at a time.
const twoPages: CommandDef = {
  id: 'layout:two-pages',
  label: 'Two pages',
  categories: ['layout'],
  active: ({ get }) => get(StageToken).getSettings().spread === 'odd',
  run: ({ get }) => {
    const stage = get(StageToken);
    stage.updateSettings({ spread: stage.getSettings().spread === 'odd' ? 'none' : 'odd' });
  },
};

const plugins = [
  stagePlugin(),
  renderPlugin(),
  commandsPlugin({ commands: [...standardCommands, twoPages] }),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

function CommandButton({ id }: { id: string }) {
  const command = useCommand(id);
  if (!command?.visible) return null;

  return (
    <button
      type="button"
      className="button"
      disabled={!command.enabled}
      aria-pressed={command.active}
      onClick={command.run}
    >
      {command.label}
    </button>
  );
}

// Turning a category off hides its commands wherever they appear.
function CategorySwitch({ category, label }: { category: string; label: string }) {
  const commands = useCommands();
  const off = useCommandsSettings((settings) => settings.disabledCategories.includes(category));

  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={!off}
        onChange={(event) =>
          event.target.checked
            ? commands.enableCategory(category)
            : commands.disableCategory(category)
        }
      />
      {label}
    </label>
  );
}

function Toolbar() {
  const commands = useCommands();

  // Run from code: the document opens with its whole first page in view.
  useEffect(() => {
    void commands.execute('zoom:fit-page');
  }, [commands]);

  return (
    <div className="toolbar">
      <div className="buttons">
        <CommandButton id="zoom:out" />
        <CommandButton id="zoom:in" />
        <CommandButton id="zoom:fit-page" />
        <CommandButton id="layout:two-pages" />
      </div>
      <div className="switches">
        <CategorySwitch category="zoom" label="Zoom" />
        <CategorySwitch category="layout" label="Layout" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Toolbar />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
