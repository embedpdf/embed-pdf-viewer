import { describe, expect, it } from 'vitest';
import type { ResolvedCommand } from '@embedpdf/plugin-commands';
import { resolvedCommandsEqual } from '../src/commands';

/**
 * The value-equality cache is what makes command state reactive WITHOUT
 * events: useCommand re-resolves every store tick and only re-renders on a
 * value change. iconAccent is an object minted fresh by every resolve(), so
 * it MUST be compared by value — miss that and accents either go stale or
 * re-render every button every tick.
 */
const cmd = (over: Partial<ResolvedCommand> = {}): ResolvedCommand => ({
  id: 'tool:square',
  label: 'Square',
  icon: 'square',
  shortcuts: [],
  enabled: true,
  active: false,
  visible: true,
  categories: [],
  ...over,
});

describe('resolvedCommandsEqual: iconAccent by value', () => {
  it('fresh-but-equal accent objects are equal (no spurious re-render)', () => {
    const a = cmd({ iconAccent: { primary: '#e5484d' } });
    const b = cmd({ iconAccent: { primary: '#e5484d' } });
    expect(resolvedCommandsEqual(a, b)).toBe(true);
  });

  it('a changed default recolors: primary, secondary, and appearing accents all differ', () => {
    const base = cmd({ iconAccent: { primary: '#e5484d' } });
    expect(resolvedCommandsEqual(base, cmd({ iconAccent: { primary: '#3b82f6' } }))).toBe(false);
    expect(
      resolvedCommandsEqual(base, cmd({ iconAccent: { primary: '#e5484d', secondary: '#fff' } })),
    ).toBe(false);
    expect(resolvedCommandsEqual(base, cmd())).toBe(false); // accent disappeared
  });
});
