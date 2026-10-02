import { describe, expect, it, vi } from 'vitest';
import { boundCommandOf, unregisteredCommand } from '../src/contract';
import type { ExecuteResult, ResolvedCommand } from '../src/contract';

/**
 * The contract's helpers for what shows a command: a resolved command bound for a button, and
 * the stand-in a toolbar draws for an id no plugin registered.
 */

const zoomIn: ResolvedCommand = {
  id: 'zoom:in',
  label: 'Zoom in',
  shortcuts: ['Mod+=', 'Mod+Plus'],
  enabled: true,
  active: false,
  visible: true,
  categories: ['zoom'],
};

const executed: ExecuteResult = { status: 'executed' };

describe('boundCommandOf', () => {
  it('keeps what the command shows and runs it by its id', async () => {
    const execute = vi.fn(async () => executed);
    const bound = boundCommandOf(zoomIn, execute, { isMac: false });
    expect(bound).toMatchObject({ id: 'zoom:in', label: 'Zoom in', enabled: true });
    await expect(bound.run()).resolves.toBe(executed);
    expect(execute).toHaveBeenCalledWith('zoom:in');
  });

  it('formats the first shortcut for the platform', () => {
    const execute = async () => executed;
    expect(boundCommandOf(zoomIn, execute, { isMac: true }).shortcut).toBe('⌘=');
    expect(boundCommandOf(zoomIn, execute, { isMac: false }).shortcut).toBe('Ctrl+=');
  });

  it('has no shortcut for a command without one', () => {
    const bound = boundCommandOf({ ...zoomIn, shortcuts: [] }, async () => executed, {
      isMac: false,
    });
    expect(bound.shortcut).toBeNull();
  });
});

describe('unregisteredCommand', () => {
  it('is disabled and named by its id', () => {
    expect(unregisteredCommand('page:unknown')).toEqual({
      id: 'page:unknown',
      label: 'page:unknown',
      shortcuts: [],
      enabled: false,
      active: false,
      visible: true,
      categories: [],
    });
  });
});
