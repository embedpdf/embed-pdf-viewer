import { describe, expect, it, vi } from 'vitest';
import { boundCommandOf, unknownCommandWarning, unregisteredCommand } from '../src/contract';
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
  it('is named by its id, neither enabled nor visible, like a turned-off command', () => {
    expect(unregisteredCommand('page:unknown')).toEqual({
      id: 'page:unknown',
      label: 'page:unknown',
      shortcuts: [],
      enabled: false,
      active: false,
      visible: false,
      categories: [],
    });
  });
});

describe('unknownCommandWarning', () => {
  it('names the id, and the closest one there is', () => {
    expect(unknownCommandWarning('zoom:fit-widht', ['zoom:fit-width', 'zoom:in'])).toBe(
      'no command "zoom:fit-widht" (did you mean "zoom:fit-width"?): it shows as neither visible nor enabled',
    );
    expect(unknownCommandWarning('acme:nothing', ['zoom:in'])).toBe(
      'no command "acme:nothing": it shows as neither visible nor enabled',
    );
  });
});
