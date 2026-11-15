import { createTestCommandContext } from '@embedpdf/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { createSelectionCommands } from '../src/commands';
import { SelectionToken } from '../src/contract';

function standard() {
  const platform = { copySelection: vi.fn(async () => 'text') };
  const items = createSelectionCommands(platform);
  return { command: (id: string) => items.find((item) => item.id === id)!, platform };
}

describe('createSelectionCommands', () => {
  it('copies a selection the user may copy', async () => {
    const { command, platform } = standard();
    const selection = { hasSelection: () => true, canCopy: () => false };
    const context = createTestCommandContext(new Map([[SelectionToken, selection]]));
    expect(command('selection:copy').enabled?.(context)).toBe(false);
    selection.canCopy = () => true;
    expect(command('selection:copy').enabled?.(context)).toBe(true);
    await command('selection:copy').run?.(context);
    expect(platform.copySelection).toHaveBeenCalledWith(selection);
  });
});
