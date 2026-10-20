/**
 * The attachment commands, for the attachments panel (its header, each file's menu) and the
 * strip over a selected file attachment annotation. The panel's commands act on the selected
 * file (`attachment.getSelected()`); the panel selects a file before it opens that file's menu.
 * Adding and deleting need `doc.attachments.modify` (a page's file: the annotation plugin's
 * `canDelete()`) and the `attachments.adding` feature. Saving takes a file out of the document,
 * so it goes with `documents.download` and needs `doc.download`: `readOnly` keeps it.
 */
import { AnnotationToken, annotationKey } from '@embedpdf/react/annotation';
import {
  AttachmentToken,
  type AttachedFile,
  type AttachmentCapability,
} from '@embedpdf/react/attachment';
import type { CommandDef } from '@embedpdf/react/commands';
import { ShellToken } from '@embedpdf/react/shell';
import { pickFile, saveFile } from '@embedpdf/web';

type Ctx = Parameters<NonNullable<CommandDef['run']>>[0];

/** The attachments panel's id in the layout. */
export const ATTACHMENTS_PANEL = 'attachments';
/** The menu of a file in the attachments panel: the commands below, for that file. */
export const ATTACHMENT_ITEM_MENU = 'attachment-item';

/** What `attachment:add` takes instead of asking: the files to attach (a drop's). */
export interface AttachmentAddArgs {
  readonly files?: readonly File[];
}

const attachmentOf = (commandContext: Ctx): AttachmentCapability | null =>
  commandContext.tryGet(AttachmentToken);

/** The first selected file. */
const selectedOf = (commandContext: Ctx): AttachedFile | null =>
  attachmentOf(commandContext)?.getSelected()[0] ?? null;

/** Save a file as the browser saves a download, under its cleaned name. */
export async function saveAttachedFile(
  attachment: AttachmentCapability,
  file: AttachedFile,
): Promise<void> {
  const { bytes, name, mimeType } = await attachment.download(file);
  saveFile(bytes, name, mimeType ?? undefined);
}

/** The one file attachment annotation selected on the pages, or null. */
const selectedAnnotationFile = (commandContext: Ctx): AttachedFile | null => {
  const selection = commandContext.tryGet(AnnotationToken)?.selection.list() ?? [];
  const [only] = selection;
  if (selection.length !== 1 || only?.subtype !== 'file-attachment') return null;
  const key = annotationKey(only.ref);
  const files = attachmentOf(commandContext)?.list() ?? [];
  return (
    files.find((file) => file.home.kind === 'page' && annotationKey(file.home.ref) === key) ?? null
  );
};

/** Saving: the right to take files out, and the feature on. */
const SAVES = {
  categories: ['documents.download'],
  allowed: (commandContext: Ctx) => attachmentOf(commandContext)?.canDownload() ?? true,
  notAllowedKey: 'commands.notAllowed.doc-download',
} satisfies Partial<CommandDef>;

/** Adding and deleting: the right to, and the feature on. */
const EDITS = {
  categories: ['attachments.adding'],
  allowed: (commandContext: Ctx) => attachmentOf(commandContext)?.canAdd() ?? true,
  notAllowedKey: 'commands.notAllowed.doc-attachments-modify',
} satisfies Partial<CommandDef>;

export const attachmentCommands: CommandDef[] = [
  {
    // Acrobat's Add File, in its Attachments panel.
    id: 'attachment:add',
    labelKey: 'commands.attachment.add',
    icon: 'plus',
    ...EDITS,
    run: async (commandContext) => {
      const attachment = attachmentOf(commandContext);
      if (!attachment) return;
      const given = (commandContext.args as AttachmentAddArgs | undefined)?.files;
      const files = given ?? [await pickFile()].filter((file): file is File => file !== null);
      if (files.length === 0) return;
      commandContext.tryGet(ShellToken)?.open(ATTACHMENTS_PANEL);
      await attachment.add(files.map((data) => ({ data })));
    },
  },
  {
    id: 'attachment:save',
    labelKey: 'commands.attachment.save',
    icon: 'download',
    ...SAVES,
    enabled: (commandContext) => selectedOf(commandContext) !== null,
    run: async (commandContext) => {
      const attachment = attachmentOf(commandContext);
      const file = selectedOf(commandContext);
      if (attachment && file) await saveAttachedFile(attachment, file);
    },
  },
  {
    id: 'attachment:go-to',
    labelKey: 'commands.attachment.goTo',
    // No feature: going to a file is reading the document.
    visible: (commandContext) => selectedOf(commandContext)?.home.kind === 'page',
    run: (commandContext) => {
      const file = selectedOf(commandContext);
      if (file) attachmentOf(commandContext)?.reveal(file);
    },
  },
  {
    id: 'attachment:delete',
    labelKey: 'commands.attachment.delete',
    icon: 'trash',
    ...EDITS,
    allowed: (commandContext) => {
      const attachment = attachmentOf(commandContext);
      const file = selectedOf(commandContext);
      if (!attachment) return true;
      return file ? attachment.canRemove(file) : attachment.canAdd();
    },
    enabled: (commandContext) => selectedOf(commandContext) !== null,
    run: async (commandContext) => {
      const attachment = attachmentOf(commandContext);
      const file = selectedOf(commandContext);
      if (attachment && file) await attachment.remove(file);
    },
  },
  // A file's menu, opened from its row's own button or by a right-click on it.
  {
    id: 'menu:attachment-item',
    labelKey: 'commands.attachment.more',
    icon: 'dots',
    menu: ATTACHMENT_ITEM_MENU,
    categories: ['attachments'],
  },
  // Over a selected file attachment annotation: its file, saved as the panel saves it.
  {
    id: 'annotation:save-file',
    labelKey: 'commands.annotate.saveFile',
    icon: 'download',
    ...SAVES,
    visible: (commandContext) => selectedAnnotationFile(commandContext) !== null,
    run: async (commandContext) => {
      const attachment = attachmentOf(commandContext);
      const file = selectedAnnotationFile(commandContext);
      if (attachment && file) await saveAttachedFile(attachment, file);
    },
  },
];
