import { createTestCommandContext } from '@embedpdf/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { createHistoryCommands } from '../src/commands';
import { HistoryToken } from '../src/contract';

const historyCommands = createHistoryCommands();
const command = (id: string) => historyCommands.find((item) => item.id === id)!;

describe('createHistoryCommands', () => {
  it('has undo and redo, with their shortcuts', () => {
    expect(historyCommands.map((item) => [item.id, item.shortcut])).toEqual([
      ['history:undo', 'Mod+Z'],
      ['history:redo', ['Mod+Shift+Z', 'Mod+Y']],
    ]);
  });

  it('undoes and redoes only while there is a step to take', () => {
    const history = { canUndo: () => true, canRedo: () => false, undo: vi.fn(), redo: vi.fn() };
    const context = createTestCommandContext(new Map([[HistoryToken, history]]));
    expect(command('history:undo').enabled?.(context)).toBe(true);
    expect(command('history:redo').enabled?.(context)).toBe(false);
    command('history:undo').run?.(context);
    expect(history.undo).toHaveBeenCalled();
    expect(history.redo).not.toHaveBeenCalled();
  });

  it('leaves undo and redo disabled without the history plugin', () => {
    const context = createTestCommandContext(new Map());
    expect(command('history:undo').enabled?.(context)).toBe(false);
    expect(command('history:redo').enabled?.(context)).toBe(false);
    expect(() => command('history:undo').run?.(context)).not.toThrow();
  });
});
