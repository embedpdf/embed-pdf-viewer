import { describe, expect, it } from 'vitest';

import { projectOverflow } from '../src/projection';
import {
  custom,
  filterBar,
  group,
  hasVisibleUnits,
  normalizeBar,
  type BarSchema,
} from '../src/schema';
import { solve, type FitMetrics } from '../src/solver';

const metrics: FitMetrics = {
  unit: () => 40,
  groupCollapsed: () => 50,
  groupTrigger: () => 36,
  overflowTrigger: 40,
  gap: 10,
  separator: 20,
};

const bar: BarSchema = {
  id: 'main',
  sections: {
    start: [group('versions', [custom('versions'), 'acme:a', 'acme:b'])],
    end: [group('tools', ['tool:pan', 'tool:pointer'], { importance: 1 })],
  },
};

describe('a custom item without a command', () => {
  it('is pinned, and so is its group', () => {
    const normalized = normalizeBar(bar);
    const versions = normalized.sections[0]!.groups[0]!;
    expect(versions.importance).toBe(5);
    expect(versions.units[0]).toMatchObject({
      kind: 'custom',
      slot: 'versions',
      terminal: null,
      importance: 5,
    });
    expect(normalized.sections[1]!.groups[0]!.importance).toBe(1);
  });

  it('keeps its importance when it has a command', () => {
    const unit = normalizeBar({
      id: 'main',
      sections: { start: [group('zoom', [custom('zoom', 'menu:zoom', { importance: 2 })])] },
    }).sections[0]!.groups[0]!.units[0]!;
    expect(unit).toMatchObject({ terminal: 'menu:zoom', importance: 2 });
  });

  it('never moves to the "More" menu while the rest of its group does', () => {
    const normalized = normalizeBar(bar);
    // Room for the custom item alone (and the "More" button): everything else overflows.
    const fit = solve(normalized, metrics, 90);
    expect(fit.units.get('versions:versions')).toEqual({ kind: 'variant', variant: 'default' });
    const rows = projectOverflow(normalized, fit, () => null).flatMap((section) => section.rows);
    expect(rows.map((row) => row.command)).toEqual([
      'acme:a',
      'acme:b',
      'tool:pan',
      'tool:pointer',
    ]);
  });

  it('keeps a group that folds from folding, since the fold would hide it', () => {
    const folding = normalizeBar({
      id: 'main',
      sections: {
        start: [group('versions', [custom('versions'), 'acme:a'], { collapse: 'menu' })],
      },
    });
    const fit = solve(folding, metrics, 10);
    expect(fit.groups.get('versions')).toMatchObject({ collapsed: false, overflowed: false });
    expect(fit.units.get('versions:versions')).toEqual({ kind: 'variant', variant: 'default' });
  });

  it('stays when the bar is filtered: no command decides about it', () => {
    const kept = filterBar(normalizeBar(bar), () => false);
    expect(kept.sections[0]!.groups[0]!.units.map((unit) => unit.key)).toEqual([
      'versions:versions',
    ]);
    expect(kept.sections[1]!.groups[0]!.units).toEqual([]);
  });
});

describe('hasVisibleUnits', () => {
  it('is false when nothing is kept, and true while a unit or a standalone item is', () => {
    const plain = normalizeBar({ id: 'x', sections: { start: [group('g', ['a', 'b'])] } });
    expect(hasVisibleUnits(plain, () => false)).toBe(false);
    expect(hasVisibleUnits(plain, (unit) => unit.key === 'g:b')).toBe(true);
    expect(hasVisibleUnits(normalizeBar(bar), () => false)).toBe(true);
    expect(hasVisibleUnits(normalizeBar({ id: 'empty', sections: {} }), () => true)).toBe(false);
  });
});
