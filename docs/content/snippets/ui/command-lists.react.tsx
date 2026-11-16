import { commandsPlugin } from '@embedpdf/react/commands';
import { historyCommands } from '@embedpdf/react/history';
import { documentCommands } from '@embedpdf/react/runtime';
import { stageCommands } from '@embedpdf/react/stage';

export const plugins = [
  /* … */
  // Zoom, pages and rotation, undo and redo, download and print: no tools, no copy.
  commandsPlugin({ commands: [...stageCommands, ...historyCommands, ...documentCommands] }),
];
