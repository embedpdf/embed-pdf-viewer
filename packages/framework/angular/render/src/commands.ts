import { createRenderCommands } from '@embedpdf/plugin-render/commands';
import { standardCommandsBrowser } from '@embedpdf/web';

/**
 * The snapshot's commands: the snapshot tool, and copy, save and clear for the snapshot it
 * holds, made with the browser's clipboard and file download.
 */
export const renderCommands = /* @__PURE__ */ createRenderCommands(standardCommandsBrowser);
