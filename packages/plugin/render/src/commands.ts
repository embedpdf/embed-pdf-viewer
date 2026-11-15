/**
 * @embedpdf/plugin-render/commands — the snapshot's commands: the snapshot
 * tool, and copy, save and clear for the snapshot it holds. Copy and save
 * reach the browser (the clipboard, a file download), which plugins never
 * touch, so the list is made with the browser's part; each framework's
 * `/render` has it ready as `renderCommands`. The i18n plugin has their
 * labels.
 */
import { DocumentsToken, type CommandContext, type CommandDefinition } from '@embedpdf/core';
import { toolCommand } from '@embedpdf/plugin-interaction/commands';

import { RenderToken, SNAPSHOT_TOOL, type PageImage } from './contract';

/** What the snapshot's commands need from the browser. */
export interface RenderCommandsPlatform {
  /**
   * Copy an image to the clipboard. Called in the press or key itself, before
   * the image is there: a browser may take the clipboard only then.
   */
  copyImage(image: Promise<PageImage>): Promise<unknown>;
  /** Give the user the bytes as a file download, of the given content type. */
  saveFile(bytes: Uint8Array | Blob, fileName: string, contentType: string): void;
}

const snapshotOf = (context: CommandContext) => context.tryGet(RenderToken)?.getSnapshot() ?? null;

/** The snapshot's commands: `tool:snapshot` and `snapshot:*`, with the browser's part from `platform`. */
export function createRenderCommands(
  platform: RenderCommandsPlatform,
): readonly CommandDefinition[] {
  return [
    // The snapshot tool, for a user who may take snapshots.
    {
      ...toolCommand(SNAPSHOT_TOOL),
      id: 'tool:snapshot',
      allowed: (context) => context.tryGet(RenderToken)?.canSnapshot() ?? true,
      notAllowedKey: 'commands.notAllowed.doc-content-copy',
    },

    // ── the snapshot the snapshot tool holds ──
    {
      id: 'snapshot:copy',
      labelKey: 'commands.snapshot.copy',
      label: 'Copy',
      icon: 'copy',
      shortcut: 'Mod+C',
      categories: ['snapshot'],
      // Straight to the clipboard, in the press itself: the picture follows when it's there.
      run: (context) => {
        const snapshot = snapshotOf(context);
        return snapshot ? platform.copyImage(snapshot.image) : undefined;
      },
      enabled: (context) => snapshotOf(context) !== null,
    },
    {
      id: 'snapshot:save',
      labelKey: 'commands.snapshot.save',
      label: 'Save image',
      icon: 'download',
      categories: ['snapshot'],
      run: async (context) => {
        const snapshot = snapshotOf(context);
        if (!snapshot) return;
        const documents = context.get(DocumentsToken);
        const id = context.documentId ?? undefined;
        const blob = await (await snapshot.image).blob();
        const number =
          documents
            .listPages(id)
            .findIndex((page) => page.ref.objectNumber === snapshot.page.objectNumber) + 1;
        platform.saveFile(blob, snapshotFileNameOf(documents.get(id)?.name, number), 'image/png');
      },
      enabled: (context) => snapshotOf(context) !== null,
    },
    {
      id: 'snapshot:clear',
      labelKey: 'commands.snapshot.clear',
      label: 'Clear snapshot',
      shortcut: 'Escape',
      categories: ['snapshot'],
      run: (context) => context.get(RenderToken).clearSnapshot(),
      enabled: (context) => snapshotOf(context) !== null,
    },
  ];
}

/** A snapshot's file name: the document's name and the page's number, as a PNG (`Report p3.png`). */
function snapshotFileNameOf(name: string | undefined, pageNumber: number): string {
  const base = (name ?? 'document').replace(/\.pdf$/i, '');
  return `${base} p${pageNumber}.png`;
}
