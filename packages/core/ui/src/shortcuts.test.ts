import { describe, expect, it } from 'vitest';
import { formatShortcut, matchShortcut, parseShortcut, type KeyStroke } from './shortcuts';

const stroke = (partial: Partial<KeyStroke> & { key: string }): KeyStroke => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...partial,
});

describe('parseShortcut', () => {
  it('parses modifiers and key', () => {
    expect(parseShortcut('Mod+K')).toEqual({
      key: 'k',
      mod: true,
      ctrl: false,
      meta: false,
      alt: false,
      shift: false,
    });
    expect(parseShortcut('Ctrl+Shift+Z').shift).toBe(true);
    expect(parseShortcut('Meta+NumpadAdd').key).toBe('numpadadd');
  });

  it('treats a trailing "+" as the literal plus key (Ctrl+=and Ctrl++)', () => {
    expect(parseShortcut('Ctrl+=').key).toBe('=');
    expect(parseShortcut('Ctrl++').key).toBe('+');
  });

  it('rejects unknown modifiers and empty keys', () => {
    expect(() => parseShortcut('Hyper+K')).toThrow(/unknown modifier/);
  });
});

describe('matchShortcut', () => {
  it('resolves Mod per platform', () => {
    const parsed = parseShortcut('Mod+K');
    expect(matchShortcut(parsed, stroke({ key: 'k', metaKey: true }), { isMac: true })).toBe(true);
    expect(matchShortcut(parsed, stroke({ key: 'k', ctrlKey: true }), { isMac: true })).toBe(false);
    expect(matchShortcut(parsed, stroke({ key: 'k', ctrlKey: true }), { isMac: false })).toBe(true);
    expect(matchShortcut(parsed, stroke({ key: 'k', metaKey: true }), { isMac: false })).toBe(
      false,
    );
  });

  it('rejects extra modifiers', () => {
    const parsed = parseShortcut('Ctrl+0');
    expect(
      matchShortcut(parsed, stroke({ key: '0', ctrlKey: true, altKey: true }), { isMac: false }),
    ).toBe(false);
  });

  it('matches printable keys regardless of shift-produced identity', () => {
    // 'Ctrl+=' on a US layout with shift held produces key '+': the v2
    // shortcut set lists 'Ctrl+=' and 'Ctrl+NumpadAdd' separately, so '='
    // must match only '='.
    const parsed = parseShortcut('Ctrl+=');
    expect(matchShortcut(parsed, stroke({ key: '=', ctrlKey: true }), { isMac: false })).toBe(true);
    expect(
      matchShortcut(parsed, stroke({ key: '+', ctrlKey: true, shiftKey: true }), { isMac: false }),
    ).toBe(false);
  });

  it('matches long key names against event.code for numpad keys', () => {
    const parsed = parseShortcut('Ctrl+NumpadAdd');
    expect(
      matchShortcut(parsed, stroke({ key: '+', code: 'NumpadAdd', ctrlKey: true }), {
        isMac: false,
      }),
    ).toBe(true);
  });
});

describe('formatShortcut', () => {
  it('renders platform-appropriate display forms', () => {
    expect(formatShortcut('Mod+K', { isMac: true })).toBe('⌘K');
    expect(formatShortcut('Mod+K', { isMac: false })).toBe('Ctrl+K');
    expect(formatShortcut('Ctrl+Shift+Z', { isMac: true })).toBe('⌃⇧Z');
    expect(formatShortcut('Ctrl+Shift+Z', { isMac: false })).toBe('Ctrl+Shift+Z');
  });
});
