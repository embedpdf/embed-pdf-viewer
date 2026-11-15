import { createDocumentCommands } from '@embedpdf/core/commands';
import { standardCommandsBrowser } from '@embedpdf/web';

/** The document's commands: download and print, made with the browser's file download. */
export const documentCommands = /* @__PURE__ */ createDocumentCommands(standardCommandsBrowser);
