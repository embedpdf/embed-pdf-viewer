/**
 * Opening a file from the user's computer: the `document:open` command, behind the document
 * menu's Open row and a PDF dropped on the viewer (`ui/drop-to-open.tsx`). It's there only while
 * the engine opens files (`documents.canOpenFiles()`), so a viewer on the cloud engine never
 * offers it, and turning off `documents.open` turns off both ways.
 */
import type { CommandDef } from '@embedpdf/react/commands';
import { DocumentsToken, type DocumentsCapability, type OpenInput } from '@embedpdf/react/runtime';
import { pickFile } from '@embedpdf/web';

export const OPEN_COMMAND_ID = 'document:open';

const PDF_TYPE = 'application/pdf';

/** What `document:open` takes to open the files it's given, a drop's, instead of asking for one. */
export interface OpenFilesArgs {
  readonly files: readonly File[];
}

/** Whether a file is a PDF, by its type or, where the system gives it none, its name. */
export const isPdfFile = (file: File): boolean =>
  file.type === PDF_TYPE || /\.pdf$/i.test(file.name);

/**
 * Whether a drag may bring a PDF: it carries files, and one of them is a PDF or of a type the
 * browser doesn't know. Text, links and anything dragged inside the page carry no files; where
 * the browser doesn't list the files while dragging, they may be PDFs.
 */
export function mayCarryPdf(transfer: DataTransfer | null): boolean {
  if (!transfer || !Array.from(transfer.types).includes('Files')) return false;
  const files = Array.from(transfer.items ?? []).filter((item) => item.kind === 'file');
  return files.length === 0 || files.some((item) => item.type === PDF_TYPE || item.type === '');
}

const givenFilesOf = (args: unknown): readonly File[] | null => {
  const files = (args as Partial<OpenFilesArgs> | undefined)?.files;
  return Array.isArray(files) ? files : null;
};

/** The file the user picks in the file dialog, as a list: empty when they close it. */
const pickedFiles = (): Promise<readonly File[]> =>
  pickFile({ accept: `.pdf,${PDF_TYPE}` }).then((file) => (file ? [file] : []));

/**
 * Open each file as a new tab, the first one shown. Its tab is there at once, named like a `src`
 * file's (its name without `.pdf`), while the file is read; one that can't be opened says why
 * in its tab.
 */
function openFiles(documents: DocumentsCapability, files: readonly File[]): void {
  documents.openAll(
    files.map((file) => ({
      name: file.name.replace(/\.pdf$/i, '') || file.name,
      source: async (): Promise<OpenInput> => ({
        kind: 'bytes',
        bytes: new Uint8Array(await file.arrayBuffer()),
      }),
    })),
  );
}

export const openFileCommand: CommandDef = {
  id: OPEN_COMMAND_ID,
  labelKey: 'commands.open',
  icon: 'fileImport',
  // The key reaches the viewer only while focus is inside it: elsewhere it's the page's own.
  shortcut: 'Mod+O',
  categories: ['documents.open'],
  // Where the engine opens only the documents a server holds, there is no Open, and its key
  // keeps the browser's own meaning.
  visible: (commandContext) => commandContext.tryGet(DocumentsToken)?.canOpenFiles() ?? false,
  run: async (commandContext) => {
    const documents = commandContext.tryGet(DocumentsToken);
    if (!documents) return;
    // The dialog opens before anything is awaited: a browser opens it only inside the click or
    // key that asked for it.
    const files = givenFilesOf(commandContext.args) ?? (await pickedFiles());
    openFiles(documents, files);
  },
};
