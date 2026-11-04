/**
 * The browser's part of the standard commands (`createStandardCommands` in
 * `@embedpdf/plugin-commands/standard`): copying the selected text or the
 * snapshot's picture, and handing the user a file as a download. Every
 * framework adapter builds its `standardCommands` from this one object.
 * Printing is the kernel's, with `browserPrinter()`.
 */
import { copyImage, copySelection } from './clipboard';
import { saveFile } from './file-picker';

/** What the standard commands need from the browser: the structural twin of `StandardCommandsPlatform`. */
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
