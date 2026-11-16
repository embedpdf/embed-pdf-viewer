/**
 * The command lists as an app spreads them. Each plugin ships a function that
 * makes its list; the lists are made here, once, with the browser's part for
 * the ones that reach it (the clipboard, a file download). Each feature entry
 * exports its own, and `standardCommands` joins them. Only `/commands`
 * entries are imported, so the standard commands bring in no plugin.
 */
import type { CommandDefinition, CommandFamily } from '@embedpdf/core';
import { createDocumentCommands } from '@embedpdf/core/commands';
import { createAnnotationCommands } from '@embedpdf/plugin-annotation/commands';
import { createHistoryCommands } from '@embedpdf/plugin-history/commands';
import { createInteractionCommands } from '@embedpdf/plugin-interaction/commands';
import { createRenderCommands } from '@embedpdf/plugin-render/commands';
import { createSelectionCommands } from '@embedpdf/plugin-selection/commands';
import { createStageCommands } from '@embedpdf/plugin-stage/commands';
import { standardCommandsBrowser } from '@embedpdf/web';

/** The Stage's commands: zoom, the page moves and view rotation. */
export const stageCommands = /* @__PURE__ */ createStageCommands();

/** The tool commands: `tool:pointer`, `tool:pan`, `tool:zoom`, and `tool:<id>` for every other tool. */
export const interactionCommands = /* @__PURE__ */ createInteractionCommands();

/** The selection's commands: copy. */
export const selectionCommands = /* @__PURE__ */ createSelectionCommands(standardCommandsBrowser);

/** The annotation plugin's commands: delete. */
export const annotationCommands = /* @__PURE__ */ createAnnotationCommands();

/** The history plugin's commands: undo and redo. */
export const historyCommands = /* @__PURE__ */ createHistoryCommands();

/** The snapshot's commands: the snapshot tool, and copy, save and clear for the snapshot it holds. */
export const renderCommands = /* @__PURE__ */ createRenderCommands(standardCommandsBrowser);

/** The document's commands: download and print. */
export const documentCommands = /* @__PURE__ */ createDocumentCommands(standardCommandsBrowser);

// A call, so a bundler drops the join from an app that never reads it.
const join = (
  ...lists: readonly (readonly (CommandDefinition | CommandFamily)[])[]
): readonly (CommandDefinition | CommandFamily)[] => lists.flat();

/**
 * The commands every viewer has, joined from the lists their owners ship: the Stage's (zoom,
 * pages, view rotation), a command for every tool (`tool:<id>`), copy, delete, undo and redo,
 * the snapshot's, and download and print. With shortcuts, and labels in EmbedPDF's eight
 * languages. Spread them into `commandsPlugin({ commands })`, or spread only the lists you need.
 */
export const standardCommands = /* @__PURE__ */ join(
  stageCommands,
  interactionCommands,
  selectionCommands,
  annotationCommands,
  historyCommands,
  renderCommands,
  documentCommands,
);
