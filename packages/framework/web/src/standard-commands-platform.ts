/**
 * The browser's part of the command lists that reach it: the selection's
 * (`createSelectionCommands`), the snapshot's (`createRenderCommands`) and
 * the document's (`createDocumentCommands`). Each takes the members it needs:
 * copying the selected text or the snapshot's picture, and handing the user a
 * file as a download. Every framework adapter builds its lists, and so its
 * `standardCommands`, from this one object. Printing is the kernel's, with
 * `browserPrinter()`.
 */
import { copyImage, copySelection } from './clipboard';
import { saveFile } from './file-picker';

/** What the command lists need from the browser: the structural twin of each list's platform type. */
export interface StandardCommandsBrowser {
  copySelection: typeof copySelection;
  copyImage: typeof copyImage;
  saveFile(bytes: Uint8Array | Blob, fileName: string, contentType: string): void;
}

export const standardCommandsBrowser: StandardCommandsBrowser = {
  copySelection,
  copyImage,
  saveFile,
};
