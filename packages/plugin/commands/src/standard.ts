/**
 * @embedpdf/plugin-commands/standard — the commands that were standard up to
 * 3.2, joined from the lists their owners ship now (`createStageCommands()`
 * in `@embedpdf/plugin-stage/commands`, and so on). Kept so code written against
 * `createStandardCommands()` keeps working; nothing new joins it. An app
 * spreads its framework package's `standardCommands`, which also has the
 * history plugin's undo and redo.
 */
import { createDocumentCommands } from '@embedpdf/core/commands';
import type { CommandDefinition, CommandFamily } from '@embedpdf/core';
import { createAnnotationCommands } from '@embedpdf/plugin-annotation/commands';
import { createInteractionCommands } from '@embedpdf/plugin-interaction/commands';
import { createRenderCommands } from '@embedpdf/plugin-render/commands';
import type { PageImage } from '@embedpdf/plugin-render/contract';
import { createSelectionCommands } from '@embedpdf/plugin-selection/commands';
import type { SelectionCapability } from '@embedpdf/plugin-selection/contract';
import { createStageCommands } from '@embedpdf/plugin-stage/commands';

/** What the standard commands need from the browser. */
export interface StandardCommandsPlatform {
  /** Copy the selected text to the clipboard. */
  copySelection(selection: SelectionCapability): Promise<unknown>;
  /**
   * Copy an image to the clipboard. Called in the press or key itself, before
   * the image is there: a browser may take the clipboard only then.
   */
  copyImage(image: Promise<PageImage>): Promise<unknown>;
  /** Give the user the bytes as a file download, of the given content type. */
  saveFile(bytes: Uint8Array | Blob, fileName: string, contentType: string): void;
}

/**
 * The Stage's, the tools', the selection's, the annotation plugin's, the
 * snapshot's and the document's commands, with the browser's part from
 * `platform`.
 *
 * @deprecated Spread your framework package's `standardCommands`, or the
 * lists you need: each plugin ships its own from its `/commands` entry.
 */
export function createStandardCommands(
  platform: StandardCommandsPlatform,
): readonly (CommandDefinition | CommandFamily)[] {
  return [
    ...createStageCommands(),
    ...createInteractionCommands(),
    ...createSelectionCommands(platform),
    ...createAnnotationCommands(),
    ...createRenderCommands(platform),
    ...createDocumentCommands(platform),
  ];
}
