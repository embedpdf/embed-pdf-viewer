/**
 * @embedpdf/plugin-commands/standard — the commands every viewer has: zoom,
 * pages, view rotation, a command for every tool, copy, delete, download and
 * print, with shortcuts, and labels in EmbedPDF's eight languages (the i18n
 * plugin has the strings). Three of them reach the browser (the clipboard, a
 * file download, the print dialog), which plugins never touch, so each
 * framework's `/commands` builds them with its platform: that is the
 * `standardCommands` an app imports.
 */
import { DocumentsToken } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { InteractionToken, type Tool } from '@embedpdf/plugin-interaction/contract';
import { SelectionToken, type SelectionCapability } from '@embedpdf/plugin-selection/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';

import type { CommandContext, CommandDef, CommandFamily } from './contract';

/** What the standard commands need from the browser. */
export interface StandardCommandsPlatform {
  /** Copy the selected text to the clipboard. */
  copySelection(selection: SelectionCapability): Promise<unknown>;
  /** Give the user the bytes as a file download. */
  saveFile(bytes: Uint8Array, fileName: string): void;
  /** Open the print dialog. */
  print(): void;
}

const stageOf = (context: CommandContext) => context.tryGet(StageToken);
const interactionOf = (context: CommandContext) => context.tryGet(InteractionToken);

/** Enabled while the document has a Stage. */
const hasStage = (context: CommandContext): boolean => stageOf(context) !== null;

/** The ids of a tool list, made once per list, which keeps its identity while the tools don't change. */
const toolIds = new WeakMap<readonly Tool[], readonly string[]>();
const idsOf = (tools: readonly Tool[]): readonly string[] => {
  let ids = toolIds.get(tools);
  if (!ids) {
    ids = tools.map((tool) => tool.id);
    toolIds.set(tools, ids);
  }
  return ids;
};

/**
 * Whether the user may use a tool: one that draws annotations needs permission to create them.
 * A tool another plugin owns asks nothing here; that plugin refuses its own gesture.
 */
const mayUseTool = (context: CommandContext, toolId: string): boolean => {
  const annotation = context.tryGet(AnnotationToken);
  return !annotation?.tools.get(toolId) || annotation.canCreate();
};

/** Switching to a tool: active while it's the tool, there only when the document has it. */
const toolCommand = (toolId: string): Omit<CommandDef, 'id' | 'shortcut'> => ({
  labelKey: `commands.tool.${toolId}`,
  label: toolId,
  icon: toolId,
  categories: ['tool'],
  run: (context) => interactionOf(context)?.activateTool(toolId),
  active: (context) => interactionOf(context)?.getActiveToolId() === toolId,
  visible: (context) => interactionOf(context)?.hasTool(toolId) ?? false,
  enabled: (context) => mayUseTool(context, toolId),
});

/** `tool:<id>` for every tool the document has. */
const toolCommands: CommandFamily = {
  prefix: 'tool:',
  names: (context) => {
    const interaction = interactionOf(context);
    return interaction ? idsOf(interaction.listTools()) : [];
  },
  command: toolCommand,
};

/** The standard commands, with the browser's part from `platform`. */
export function createStandardCommands(
  platform: StandardCommandsPlatform,
): readonly (CommandDef | CommandFamily)[] {
  return [
    // ── zoom ──
    {
      id: 'zoom:in',
      labelKey: 'commands.zoom.in',
      label: 'Zoom in',
      icon: 'zoom-in',
      shortcut: ['Mod+=', 'Mod+NumpadAdd'],
      categories: ['zoom'],
      run: (context) => stageOf(context)?.zoomIn(),
      enabled: hasStage,
    },
    {
      id: 'zoom:out',
      labelKey: 'commands.zoom.out',
      label: 'Zoom out',
      icon: 'zoom-out',
      shortcut: ['Mod+-', 'Mod+NumpadSubtract'],
      categories: ['zoom'],
      run: (context) => stageOf(context)?.zoomOut(),
      enabled: hasStage,
    },
    {
      id: 'zoom:fit-width',
      labelKey: 'commands.zoom.fitWidth',
      label: 'Fit width',
      icon: 'fit-width',
      categories: ['zoom'],
      run: (context) => stageOf(context)?.fitWidth(),
      active: (context) => stageOf(context)?.getZoomMode() === 'fit-width',
      enabled: hasStage,
    },
    {
      id: 'zoom:fit-page',
      labelKey: 'commands.zoom.fitPage',
      label: 'Fit page',
      icon: 'fit-page',
      categories: ['zoom'],
      run: (context) => stageOf(context)?.fitPage(),
      active: (context) => stageOf(context)?.getZoomMode() === 'fit-page',
      enabled: hasStage,
    },

    // ── pages ──
    {
      id: 'page:next',
      labelKey: 'commands.page.next',
      label: 'Next page',
      icon: 'next-page',
      shortcut: 'ArrowRight',
      categories: ['page'],
      run: (context) => stageOf(context)?.nextPage(),
      enabled: (context) => stageOf(context)?.canGoNext() ?? false,
    },
    {
      id: 'page:previous',
      labelKey: 'commands.page.previous',
      label: 'Previous page',
      icon: 'previous-page',
      shortcut: 'ArrowLeft',
      categories: ['page'],
      run: (context) => stageOf(context)?.previousPage(),
      enabled: (context) => stageOf(context)?.canGoPrevious() ?? false,
    },
    {
      id: 'page:first',
      labelKey: 'commands.page.first',
      label: 'First page',
      icon: 'first-page',
      shortcut: 'Home',
      categories: ['page'],
      run: (context) => stageOf(context)?.goToFirstPage(),
      enabled: (context) => stageOf(context)?.canGoPrevious() ?? false,
    },
    {
      id: 'page:last',
      labelKey: 'commands.page.last',
      label: 'Last page',
      icon: 'last-page',
      shortcut: 'End',
      categories: ['page'],
      run: (context) => stageOf(context)?.goToLastPage(),
      enabled: (context) => stageOf(context)?.canGoNext() ?? false,
    },

    // ── view rotation: how the pages show, nothing written to the PDF ──
    {
      id: 'view:rotate-clockwise',
      labelKey: 'commands.view.rotateClockwise',
      label: 'Rotate clockwise',
      icon: 'rotate-clockwise',
      categories: ['view'],
      run: (context) => stageOf(context)?.rotateViewBy(90),
      enabled: hasStage,
    },
    {
      id: 'view:rotate-counterclockwise',
      labelKey: 'commands.view.rotateCounterclockwise',
      label: 'Rotate counterclockwise',
      icon: 'rotate-counterclockwise',
      categories: ['view'],
      run: (context) => stageOf(context)?.rotateViewBy(-90),
      enabled: hasStage,
    },

    // ── tools: the two built-in ones have shortcuts; the family covers every other ──
    { ...toolCommand('pointer'), id: 'tool:pointer', shortcut: 'V' },
    { ...toolCommand('pan'), id: 'tool:pan', shortcut: 'H' },
    toolCommands,

    // ── selections ──
    {
      id: 'selection:copy',
      labelKey: 'commands.selection.copy',
      label: 'Copy',
      icon: 'copy',
      shortcut: 'Mod+C',
      categories: ['selection'],
      run: (context) => platform.copySelection(context.get(SelectionToken)),
      enabled: (context) => {
        const selection = context.tryGet(SelectionToken);
        return !!selection && selection.hasSelection() && selection.canCopy();
      },
    },
    {
      id: 'annotation:delete',
      labelKey: 'commands.annotation.delete',
      label: 'Delete',
      icon: 'delete',
      shortcut: ['Delete', 'Backspace'],
      categories: ['annotation'],
      run: (context) => context.get(AnnotationToken).selection.delete({ signal: context.signal }),
      enabled: (context) => {
        const annotation = context.tryGet(AnnotationToken);
        if (!annotation) return false;
        const selected = annotation.selection.list();
        return selected.length > 0 && selected.every(({ ref }) => annotation.canDelete(ref));
      },
    },

    // ── the document ──
    {
      id: 'document:download',
      labelKey: 'commands.document.download',
      label: 'Download',
      icon: 'download',
      shortcut: 'Mod+S',
      categories: ['document'],
      run: async (context) => {
        const documents = context.get(DocumentsToken);
        const id = context.documentId ?? undefined;
        const bytes = await documents.download(id, { signal: context.signal });
        platform.saveFile(bytes, fileNameOf(documents.get(id)?.name));
      },
      enabled: (context) =>
        context.documentId !== null && context.get(DocumentsToken).canDownload(context.documentId),
    },
    {
      id: 'document:print',
      labelKey: 'commands.document.print',
      label: 'Print',
      icon: 'print',
      shortcut: 'Mod+P',
      categories: ['document'],
      // The document's own print actions run around the dialog when the
      // actions plugin is there.
      run: (context) => {
        const actions = context.tryGet(ActionsToken);
        if (actions) return actions.runDocumentVerb('print', () => platform.print());
        platform.print();
      },
      enabled: (context) =>
        context.documentId !== null && context.get(DocumentsToken).canPrint(context.documentId),
    },
  ];
}

/** The download's file name: the document's name, ending in `.pdf`. */
function fileNameOf(name: string | undefined): string {
  if (!name) return 'document.pdf';
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}
