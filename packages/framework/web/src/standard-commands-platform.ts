/**
 * The browser's part of the standard commands (`createStandardCommands` in
 * `@embedpdf/plugin-commands/standard`): copying the selected text, handing
 * the document to the user as a download, and the print dialog. Every
 * framework adapter builds its `standardCommands` from this one object.
 */
import { copySelection } from './clipboard';
import { saveFile } from './file-picker';

/** What the standard commands need from the browser: the structural twin of `StandardCommandsPlatform`. */
export interface StandardCommandsBrowser {
  copySelection: typeof copySelection;
  saveFile(bytes: Uint8Array, fileName: string): void;
  print(): void;
}

export const standardCommandsBrowser: StandardCommandsBrowser = {
  copySelection,
  saveFile: (bytes, fileName) => saveFile(bytes, fileName, 'application/pdf'),
  print: () => window.print(),
};
