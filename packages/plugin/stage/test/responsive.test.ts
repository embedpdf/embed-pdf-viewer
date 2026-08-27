import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import { boxOf, eqSetting, matchesQuery, mergeSettings, resolveResponsive } from '../src/responsive';
import type { ResponsiveRule, StageSettings } from '../src/types';

const BASE: StageSettings = { ...DEFAULT_SETTINGS };

describe('boxOf', () => {
  it('derives orientation from the box, square counting as portrait (CSS)', () => {
    expect(boxOf({ width: 800, height: 600 }).orientation).toBe('landscape');
    expect(boxOf({ width: 600, height: 800 }).orientation).toBe('portrait');
    expect(boxOf({ width: 700, height: 700 }).orientation).toBe('portrait');
  });
});

describe('matchesQuery', () => {
  const box = boxOf({ width: 500, height: 900 });
  it('is inclusive on every bound and ANDs all conditions', () => {
    expect(matchesQuery({}, box)).toBe(true); // empty query matches everything
    expect(matchesQuery({ maxWidth: 500 }, box)).toBe(true); // inclusive
    expect(matchesQuery({ minWidth: 500 }, box)).toBe(true); // inclusive
    expect(matchesQuery({ maxWidth: 499 }, box)).toBe(false);
    expect(matchesQuery({ minWidth: 501 }, box)).toBe(false);
    expect(matchesQuery({ minHeight: 800, maxHeight: 1000 }, box)).toBe(true);
    expect(matchesQuery({ maxWidth: 600, orientation: 'portrait' }, box)).toBe(true);
    expect(matchesQuery({ maxWidth: 600, orientation: 'landscape' }, box)).toBe(false);
  });
});

describe('resolveResponsive', () => {
  it('applies matching rules in source order, later winning per key', () => {
    const rules: ResponsiveRule[] = [
      { name: 'a', when: { maxWidth: 900 }, settings: { padding: 12, gap: 4 } },
      { name: 'b', when: { maxWidth: 600 }, settings: { padding: 4 } },
    ];
    const wide = resolveResponsive(BASE, rules, boxOf({ width: 1200, height: 700 }));
    expect(wide.effective.padding).toBe(BASE.padding);
    expect(wide.active).toEqual([]);
    const mid = resolveResponsive(BASE, rules, boxOf({ width: 800, height: 700 }));
    expect(mid.effective.padding).toBe(12);
    expect(mid.effective.gap).toBe(4);
    expect(mid.active).toEqual(['a']);
    const narrow = resolveResponsive(BASE, rules, boxOf({ width: 500, height: 700 }));
    expect(narrow.effective.padding).toBe(4); // later rule wins the shared key
    expect(narrow.effective.gap).toBe(4); // earlier rule's other key still applies
    expect(narrow.active).toEqual(['a', 'b']);
  });

  it('supports predicate rules and pure named queries (no settings)', () => {
    const rules: ResponsiveRule[] = [
      { name: 'ultrawide', when: (box) => box.width / box.height > 2, settings: { layout: 'horizontal' } },
      { name: 'phone', when: { maxWidth: 600 } }, // pure query — a shared breakpoint
    ];
    const r = resolveResponsive(BASE, rules, boxOf({ width: 500, height: 200 }));
    expect(r.effective.layout).toBe('horizontal');
    expect(r.active).toEqual(['ultrawide', 'phone']);
    expect(r.effective.padding).toBe(BASE.padding); // the pure query asserts nothing
  });

  it('skips undefined values in rule patches (Partial semantics)', () => {
    const rules: ResponsiveRule[] = [
      { when: {}, settings: { padding: undefined as unknown as number, gap: 2 } },
    ];
    const r = resolveResponsive(BASE, rules, boxOf({ width: 100, height: 100 }));
    expect(r.effective.padding).toBe(BASE.padding);
    expect(r.effective.gap).toBe(2);
  });

  it('does not mutate the base', () => {
    const before = { ...BASE };
    resolveResponsive(BASE, [{ when: {}, settings: { padding: 1 } }], boxOf({ width: 1, height: 1 }));
    expect(BASE).toEqual(before);
  });
});

describe('eqSetting', () => {
  it('compares primitives by identity and settings-shaped objects one level deep', () => {
    expect(eqSetting(24, 24)).toBe(true);
    expect(eqSetting(24, 8)).toBe(false);
    expect(eqSetting({ px: 16 }, { px: 16 })).toBe(true);
    expect(eqSetting({ px: 16 }, { px: 8 })).toBe(false);
    expect(eqSetting({ x: 'center', y: 'start' }, { x: 'center', y: 'start' })).toBe(true);
    expect(eqSetting({ x: 'center' }, { x: 'center', y: 'start' })).toBe(false);
    expect(eqSetting(16, { px: 16 })).toBe(false); // world gap vs screen gap differ
  });
});

describe('mergeSettings', () => {
  it('overrides defined keys only', () => {
    const merged = mergeSettings(BASE, { padding: 3, layout: undefined });
    expect(merged.padding).toBe(3);
    expect(merged.layout).toBe(BASE.layout);
  });
});
