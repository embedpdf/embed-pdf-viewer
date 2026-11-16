import { createSelectionCommands } from '@embedpdf/plugin-selection/commands';
import { standardCommandsBrowser } from '@embedpdf/web';

/** The selection's commands: copy, made with the browser's clipboard. */
export const selectionCommands = /* @__PURE__ */ createSelectionCommands(standardCommandsBrowser);
