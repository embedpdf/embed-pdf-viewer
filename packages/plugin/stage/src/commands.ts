/**
 * @embedpdf/plugin-stage/commands — the Stage's commands: zoom, moving through
 * the pages and turning the view, with their shortcuts. Each framework's
 * `/stage` has the list ready as `stageCommands`, for the commands plugin's
 * `commands` setting, on its own or as part of `standardCommands`. The i18n
 * plugin has their labels.
 */
import type { CommandContext, CommandDefinition } from '@embedpdf/core';

import { StageToken } from './contract';

const stageOf = (context: CommandContext) => context.tryGet(StageToken);

/** Enabled while the document has a Stage. */
const hasStage = (context: CommandContext): boolean => stageOf(context) !== null;

/** The Stage's commands: `zoom:*`, `page:*` and `view:rotate-*`. */
export function createStageCommands(): readonly CommandDefinition[] {
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
      enabled: (context) => stageOf(context)?.canZoomIn() ?? false,
    },
    {
      id: 'zoom:out',
      labelKey: 'commands.zoom.out',
      label: 'Zoom out',
      icon: 'zoom-out',
      shortcut: ['Mod+-', 'Mod+NumpadSubtract'],
      categories: ['zoom'],
      run: (context) => stageOf(context)?.zoomOut(),
      enabled: (context) => stageOf(context)?.canZoomOut() ?? false,
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
  ];
}
