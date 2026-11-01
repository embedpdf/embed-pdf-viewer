/**
 * The page commands, for the thumbnails panel (its header, each page's menu, its keys) and
 * `viewer.commands.execute()`. They act on the selected pages (`pageEdit.getSelected()`); the
 * panel selects a page before it opens that page's menu. Changing pages needs
 * `doc.pages.assemble` (`pageEdit.canEdit()`) and the `pages` feature. Extracting copies pages
 * out without changing the document, so it goes with `documents.download` and needs
 * `doc.download` (`pageEdit.canExtract()`): `readOnly` keeps it.
 *
 * Each edit is one step of the history, so the panel's header has undo and redo, and a delete
 * needs no confirm.
 */
import type { CommandDef } from '@embedpdf/react/commands';
import {
  PageEditToken,
  type PageEditCapability,
  type PagePosition,
} from '@embedpdf/react/page-edit';
import { DocumentsToken, type PageRef } from '@embedpdf/react/runtime';
import { pickFile, saveFile } from '@embedpdf/web';

import { isPdfFile } from './open-files';

type Ctx = Parameters<NonNullable<CommandDef['run']>>[0];

/** The menu of a page: the commands below, for that page and the others selected with it. */
export const PAGE_MENU = 'page';

const PDF_TYPE = 'application/pdf';

/**
 * What the insert commands take instead of asking: where the pages go (a gap between two
 * thumbnails), and for `page:insert-file`, the PDFs to insert (a drop's).
 */
export interface PageInsertArgs {
  readonly position?: PagePosition;
  readonly files?: readonly File[];
}

const pageEditOf = (commandContext: Ctx): PageEditCapability | null =>
  commandContext.tryGet(PageEditToken);

const selectedOf = (commandContext: Ctx): readonly PageRef[] =>
  pageEditOf(commandContext)?.getSelected() ?? [];

const hasSelection = (commandContext: Ctx): boolean => selectedOf(commandContext).length > 0;

/** The document's pages, in display order. */
const pagesOf = (commandContext: Ctx) =>
  commandContext.tryGet(DocumentsToken)?.listPages(commandContext.documentId ?? undefined) ?? [];

const argsOf = (commandContext: Ctx): PageInsertArgs =>
  (commandContext.args as PageInsertArgs | undefined) ?? {};

/** What a command that changes the pages needs: the right to, and the feature on. */
const PAGE_EDITS = {
  categories: ['pages'],
  allowed: (commandContext: Ctx) => pageEditOf(commandContext)?.canEdit() ?? true,
  notAllowedKey: 'commands.notAllowed.doc-pages-assemble',
} satisfies Partial<CommandDef>;

/**
 * Where new pages go: where the caller says, else after the selected page that comes last, else
 * at the end.
 */
function insertPositionOf(commandContext: Ctx): PagePosition {
  const given = argsOf(commandContext).position;
  if (given) return given;
  const selected = new Set(selectedOf(commandContext).map((ref) => ref.objectNumber));
  const last = pagesOf(commandContext)
    .filter((page) => selected.has(page.ref.objectNumber))
    .pop();
  return last ? { after: last.ref } : 'end';
}

/** The PDFs the caller passed, else the one the user picks: empty when they close the dialog. */
async function filesToInsert(commandContext: Ctx): Promise<readonly File[]> {
  const given = argsOf(commandContext).files;
  if (given) return given.filter(isPdfFile);
  // The dialog opens before anything is awaited: a browser opens it only inside the click or key
  // that asked for it.
  const picked = await pickFile({ accept: `.pdf,${PDF_TYPE}` });
  return picked ? [picked] : [];
}

/** The name of a copy of some of the document's pages: the document's own name, then `-pages`. */
function extractNameOf(commandContext: Ctx): string {
  const id = commandContext.documentId ?? undefined;
  const name = commandContext
    .tryGet(DocumentsToken)
    ?.get(id)
    ?.name?.replace(/\.pdf$/i, '');
  return `${name || 'document'}-pages.pdf`;
}

const rotate = (id: string, labelKey: string, icon: string, delta: 90 | -90): CommandDef => ({
  id,
  labelKey,
  icon,
  ...PAGE_EDITS,
  enabled: hasSelection,
  run: async (commandContext) => {
    const selected = selectedOf(commandContext);
    if (selected.length > 0) await pageEditOf(commandContext)?.rotateBy(selected, delta);
  },
});

export const pageCommands: CommandDef[] = [
  rotate('page:rotate-clockwise', 'commands.pages.rotateClockwise', 'pageRotateClockwise', 90),
  rotate(
    'page:rotate-counterclockwise',
    'commands.pages.rotateCounterclockwise',
    'pageRotateCounterClockwise',
    -90,
  ),
  {
    id: 'page:delete',
    labelKey: 'commands.pages.delete',
    icon: 'trash',
    ...PAGE_EDITS,
    // A document keeps at least one page.
    enabled: (commandContext) => {
      const count = selectedOf(commandContext).length;
      return count > 0 && count < pagesOf(commandContext).length;
    },
    run: async (commandContext) => {
      const selected = selectedOf(commandContext);
      if (selected.length > 0) await pageEditOf(commandContext)?.delete(selected);
    },
  },
  {
    id: 'page:duplicate',
    labelKey: 'commands.pages.duplicate',
    icon: 'copy',
    ...PAGE_EDITS,
    enabled: hasSelection,
    run: async (commandContext) => {
      const pageEdit = pageEditOf(commandContext);
      const selected = selectedOf(commandContext);
      if (!pageEdit || selected.length === 0) return;
      const { pages } = await pageEdit.duplicate(selected);
      pageEdit.select(pages);
    },
  },
  {
    id: 'page:insert-blank',
    labelKey: 'commands.pages.insertBlank',
    icon: 'filePlus',
    ...PAGE_EDITS,
    run: async (commandContext) => {
      const pageEdit = pageEditOf(commandContext);
      if (!pageEdit) return;
      const { pages } = await pageEdit.insertBlank({ position: insertPositionOf(commandContext) });
      pageEdit.select(pages);
    },
  },
  {
    id: 'page:insert-file',
    labelKey: 'commands.pages.insertFile',
    icon: 'fileImport',
    ...PAGE_EDITS,
    run: async (commandContext) => {
      const pageEdit = pageEditOf(commandContext);
      if (!pageEdit) return;
      let position = insertPositionOf(commandContext);
      const files = await filesToInsert(commandContext);
      const inserted: PageRef[] = [];
      // One file after another, each after the pages of the one before it.
      for (const file of files) {
        const { pages } = await pageEdit.insertFromBytes(new Uint8Array(await file.arrayBuffer()), {
          position,
        });
        inserted.push(...pages);
        const last = pages[pages.length - 1];
        if (last) position = { after: last };
      }
      if (inserted.length > 0) pageEdit.select(inserted);
    },
  },
  {
    id: 'page:extract',
    labelKey: 'commands.pages.extract',
    icon: 'fileExport',
    categories: ['documents.download'],
    allowed: (commandContext) => pageEditOf(commandContext)?.canExtract() ?? true,
    notAllowedKey: 'commands.notAllowed.doc-download',
    enabled: hasSelection,
    run: async (commandContext) => {
      const selected = selectedOf(commandContext);
      const pageEdit = pageEditOf(commandContext);
      if (!pageEdit || selected.length === 0) return;
      const bytes = await pageEdit.extract(selected);
      saveFile(bytes, extractNameOf(commandContext), PDF_TYPE);
    },
  },
  {
    id: 'page:select-all',
    labelKey: 'commands.pages.selectAll',
    categories: PAGE_EDITS.categories,
    enabled: (commandContext) => selectedOf(commandContext).length < pagesOf(commandContext).length,
    run: (commandContext) =>
      pageEditOf(commandContext)?.select(pagesOf(commandContext).map((page) => page.ref)),
  },
  // A page's menu, opened from the page's own button, a right-click or a long-press on it.
  {
    id: 'menu:page',
    labelKey: 'commands.pages.more',
    icon: 'dots',
    menu: PAGE_MENU,
    ...PAGE_EDITS,
  },
];
