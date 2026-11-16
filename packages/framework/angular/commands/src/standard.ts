/**
 * The standard commands, joined from the lists their owners ship. Each plugin
 * ships a function that makes its list; the lists are made here, with the
 * browser's part for the ones that reach it (the clipboard, a file download).
 * An Angular entry point can't share a file with another, so each feature
 * entry makes the list it exports too.
 * Only `/commands` entries are imported, so the standard commands bring in no
 * plugin.
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

// A call, so a bundler drops the join from an app that never reads it.
const join = (
  ...lists: readonly (readonly (CommandDefinition | CommandFamily)[])[]
): readonly (CommandDefinition | CommandFamily)[] => lists.flat();

/**
 * The commands every viewer has, joined from the lists their owners ship: the Stage's (zoom,
 * pages, view rotation), a command for every tool (`tool:<id>`), copy, delete, undo and redo,
 * the snapshot's, and download and print. With shortcuts, and labels in EmbedPDF's eight
 * languages. Spread them into `withCommands({ commands })`, or spread only the lists you need.
 */
export const standardCommands = /* @__PURE__ */ join(
  /* @__PURE__ */ createStageCommands(),
  /* @__PURE__ */ createInteractionCommands(),
  /* @__PURE__ */ createSelectionCommands(standardCommandsBrowser),
  /* @__PURE__ */ createAnnotationCommands(),
  /* @__PURE__ */ createHistoryCommands(),
  /* @__PURE__ */ createRenderCommands(standardCommandsBrowser),
  /* @__PURE__ */ createDocumentCommands(standardCommandsBrowser),
);
