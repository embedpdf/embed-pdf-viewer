import { createTestCommandContext } from '@embedpdf/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { createStageCommands } from '../src/commands';
import { StageToken } from '../src/contract';

const stageCommands = createStageCommands();
const command = (id: string) => stageCommands.find((item) => item.id === id)!;
const shortcutsOf = (items: readonly { id: string; shortcut?: string | readonly string[] }[]) =>
  Object.fromEntries(items.map((item) => [item.id, item.shortcut ?? null]));

describe('createStageCommands', () => {
  it('has zoom, the page moves and view rotation, with their shortcuts', () => {
    expect(shortcutsOf(stageCommands)).toEqual({
      'zoom:in': ['Mod+=', 'Mod+NumpadAdd'],
      'zoom:out': ['Mod+-', 'Mod+NumpadSubtract'],
      'zoom:fit-width': null,
      'zoom:fit-page': null,
      'page:next': 'ArrowRight',
      'page:previous': 'ArrowLeft',
      'page:first': 'Home',
      'page:last': 'End',
      'view:rotate-clockwise': null,
      'view:rotate-counterclockwise': null,
    });
    expect(
      stageCommands.every((item) => item.labelKey?.startsWith('commands.') && item.label),
    ).toBe(true);
  });

  it('moves through pages only where there is somewhere to go', () => {
    const stage = { canGoNext: () => false, canGoPrevious: () => true, previousPage: vi.fn() };
    const context = createTestCommandContext(new Map([[StageToken, stage]]));
    expect(command('page:next').enabled?.(context)).toBe(false);
    expect(command('page:last').enabled?.(context)).toBe(false);
    expect(command('page:previous').enabled?.(context)).toBe(true);
    command('page:previous').run?.(context);
    expect(stage.previousPage).toHaveBeenCalled();
    expect(command('zoom:in').enabled?.(createTestCommandContext(new Map()))).toBe(false);
  });

  it('zooms only while the zoom is inside its limits', () => {
    const stage = { canZoomIn: () => false, canZoomOut: () => true };
    const context = createTestCommandContext(new Map([[StageToken, stage]]));
    expect(command('zoom:in').enabled?.(context)).toBe(false);
    expect(command('zoom:out').enabled?.(context)).toBe(true);
  });
});
