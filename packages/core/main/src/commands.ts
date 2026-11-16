/**
 * @embedpdf/core/commands — the commands of the documents capability:
 * download and print. Download hands the user a file, which is the browser's
 * part, so the list is made with it; each framework package has it ready as
 * `documentCommands`. Print goes through the kernel, which has the host's
 * printer. The i18n plugin has their labels.
 */
import type { CommandDefinition } from './command-types';
import { DocumentsToken } from './types';

/** What the document's commands need from the browser. */
export interface DocumentCommandsPlatform {
  /** Give the user the bytes as a file download, of the given content type. */
  saveFile(bytes: Uint8Array | Blob, fileName: string, contentType: string): void;
}

/** The document's commands: `document:download` and `document:print`, with the browser's part from `platform`. */
export function createDocumentCommands(
  platform: DocumentCommandsPlatform,
): readonly CommandDefinition[] {
  return [
    {
      id: 'document:download',
      labelKey: 'commands.document.download',
      label: 'Download',
      icon: 'download',
      shortcut: 'Mod+S',
      categories: ['document'],
      allowed: (context) => context.tryGet(DocumentsToken)?.canDownload() ?? true,
      notAllowedKey: 'commands.notAllowed.doc-download',
      run: async (context) => {
        const documents = context.get(DocumentsToken);
        const id = context.documentId ?? undefined;
        const bytes = await documents.download(id, { signal: context.signal });
        platform.saveFile(bytes, fileNameOf(documents.get(id)?.name), 'application/pdf');
      },
      enabled: (context) => context.documentId !== null,
    },
    {
      id: 'document:print',
      labelKey: 'commands.document.print',
      label: 'Print',
      icon: 'print',
      shortcut: 'Mod+P',
      categories: ['document'],
      allowed: (context) => context.tryGet(DocumentsToken)?.canPrint() ?? true,
      notAllowedKey: 'commands.notAllowed.doc-print',
      // The kernel prints the document's pages, and runs the document's own
      // print actions around the dialog when the actions plugin is there.
      run: async (context) => {
        const documents = context.get(DocumentsToken);
        await documents.print(context.documentId ?? undefined, { signal: context.signal });
      },
      enabled: (context) => context.documentId !== null,
    },
  ];
}

/** The download's file name: the document's name, ending in `.pdf`. */
function fileNameOf(name: string | undefined): string {
  if (!name) return 'document.pdf';
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}
