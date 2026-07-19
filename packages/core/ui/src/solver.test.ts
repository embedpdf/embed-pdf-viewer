import { describe, expect, it } from 'vitest';
import { group, item, custom, normalizeBar, type BarSchema } from './schema';
import { solve, type FitMetrics } from './solver';

/** Metrics stub: every command variant has a fixed width by variant name. */
function metrics(overrides?: {
  unitWidths?: Record<string, Record<string, number>>;
  collapsedWidths?: Record<string, number>;
  triggerWidths?: Record<string, number>;
  gap?: number;
  separator?: number;
  overflowTrigger?: number;
}): FitMetrics {
  const variantDefaults: Record<string, number> = { 'icon+label': 100, icon: 40, label: 80 };
  return {
    unit: (key, variant) =>
      overrides?.unitWidths?.[key]?.[variant] ?? variantDefaults[variant] ?? 40,
    groupCollapsed: (id) => overrides?.collapsedWidths?.[id] ?? 50,
    groupTrigger: (id) => overrides?.triggerWidths?.[id] ?? 36,
    overflowTrigger: overrides?.overflowTrigger ?? 40,
    gap: overrides?.gap ?? 10,
    separator: overrides?.separator ?? 20,
  };
}

const bar = (sections: BarSchema['sections']): ReturnType<typeof normalizeBar> =>
  normalizeBar({ id: 'test', sections });

const assignmentOf = (fit: ReturnType<typeof solve>, key: string) => {
  const a = fit.units.get(key);
  if (!a) throw new Error(`no assignment for ${key}`);
  return a;
};

describe('solve — fitting', () => {
  it('keeps everything at the richest variant when the container is wide', () => {
    const b = bar({
      start: [group('g', [item('a', { variants: ['icon+label', 'icon'] }), item('b')])],
    });
    const fit = solve(b, metrics(), 1000);
    expect(assignmentOf(fit, 'g:a')).toEqual({ kind: 'variant', variant: 'icon+label' });
    expect(assignmentOf(fit, 'g:b')).toEqual({ kind: 'variant', variant: 'icon' });
    expect(fit.hasOverflow).toBe(false);
    // 100 + 40 + one gap
    expect(fit.width).toBe(150);
  });

  it('degrades variants before anything overflows', () => {
    const b = bar({
      start: [
        group('g', [
          item('a', { variants: ['icon+label', 'icon'] }),
          item('b', { variants: ['icon+label', 'icon'] }),
        ]),
      ],
    });
    // richest = 100+100+10 = 210; icons = 40+40+10 = 90
    const fit = solve(b, metrics(), 100);
    expect(assignmentOf(fit, 'g:a')).toEqual({ kind: 'variant', variant: 'icon' });
    expect(assignmentOf(fit, 'g:b')).toEqual({ kind: 'variant', variant: 'icon' });
    expect(fit.hasOverflow).toBe(false);
  });

  it('degrades the rightmost unit first among equal importance', () => {
    const b = bar({
      start: [
        group('g', [
          item('a', { variants: ['icon+label', 'icon'] }),
          item('b', { variants: ['icon+label', 'icon'] }),
        ]),
      ],
    });
    // 100+100+10=210 > 160; dropping ONE label reaches 100+40+10=150 <= 160.
    const fit = solve(b, metrics(), 160);
    expect(assignmentOf(fit, 'g:a')).toEqual({ kind: 'variant', variant: 'icon+label' });
    expect(assignmentOf(fit, 'g:b')).toEqual({ kind: 'variant', variant: 'icon' });
  });

  it('degrades lower importance before higher importance regardless of position', () => {
    const b = bar({
      start: [
        group('g', [
          item('low', { variants: ['icon+label', 'icon'], importance: 1 }),
          item('high', { variants: ['icon+label', 'icon'], importance: 4 }),
        ]),
      ],
    });
    const fit = solve(b, metrics(), 160);
    expect(assignmentOf(fit, 'g:low')).toEqual({ kind: 'variant', variant: 'icon' });
    expect(assignmentOf(fit, 'g:high')).toEqual({ kind: 'variant', variant: 'icon+label' });
  });
});

describe('solve — overflow', () => {
  it('sheds exhausted units to overflow and reserves the trigger', () => {
    const b = bar({ start: [group('g', [item('a'), item('b'), item('c')])] });
    // icons: 40*3 + 2*10 = 140. Budget 100: shed c → a,b,trigger = 40*3+2*10 = 140?
    // With trigger (40): a,b,trigger = 120+20 = 140 > 100 → shed b too:
    // a,trigger = 80+10 = 90 <= 100.
    const fit = solve(b, metrics(), 100);
    expect(assignmentOf(fit, 'g:a')).toEqual({ kind: 'variant', variant: 'icon' });
    expect(assignmentOf(fit, 'g:b')).toEqual({ kind: 'overflow' });
    expect(assignmentOf(fit, 'g:c')).toEqual({ kind: 'overflow' });
    expect(fit.hasOverflow).toBe(true);
    expect(fit.width).toBeLessThanOrEqual(100);
  });

  it('accounts for the trigger via the two-pass fixpoint (fits without trigger, not with)', () => {
    const b = bar({ start: [group('g', [item('a'), item('b')])] });
    // a,b = 90 fits in 100 → pass 1 finds no overflow → done, no trigger.
    const fit = solve(b, metrics(), 100);
    expect(fit.hasOverflow).toBe(false);
    // At 89, pass 1 overflows b; pass 2 with trigger: a+trigger = 90 > 89 → a also... a is
    // last remaining non-pinned: it overflows too, leaving just the trigger (40).
    const tight = solve(b, metrics(), 89);
    expect(tight.hasOverflow).toBe(true);
    expect(assignmentOf(tight, 'g:b')).toEqual({ kind: 'overflow' });
    expect(assignmentOf(tight, 'g:a')).toEqual({ kind: 'overflow' });
    expect(tight.width).toBe(40);
  });

  it('never overflows pinned units — they are the floor', () => {
    const b = bar({
      start: [group('g', [item('a', { importance: 5 }), item('b')])],
    });
    const fit = solve(b, metrics(), 10); // impossible budget
    expect(assignmentOf(fit, 'g:a')).toEqual({ kind: 'variant', variant: 'icon' });
    expect(assignmentOf(fit, 'g:b')).toEqual({ kind: 'overflow' });
    // floor exceeds budget — allowed
    expect(fit.width).toBeGreaterThan(10);
  });

  it('assigns every unit — visible or overflow, never lost', () => {
    const b = bar({
      start: [group('g1', [item('a'), item('b')]), group('g2', [item('c')])],
      center: [
        group('g3', { collapse: 'menu' }, [item('d'), item('e')]),
        group('g5', { shed: true }, [item('f'), item('h'), item('j')]),
      ],
      end: [group('g4', [custom('z', { terminal: 'zmenu' })])],
    });
    for (const budget of [0, 50, 100, 150, 200, 500, 1000]) {
      const fit = solve(b, metrics(), budget);
      for (const key of ['g1:a', 'g1:b', 'g2:c', 'g3:d', 'g3:e', 'g5:f', 'g5:h', 'g5:j', 'g4:z']) {
        expect(fit.units.get(key), `budget ${budget}, unit ${key}`).toBeDefined();
      }
    }
  });
});

describe('solve — group collapse', () => {
  it('collapses a group only after its children exhaust their ladders, then overflows it whole', () => {
    const b = bar({
      center: [
        group('modes', { collapse: 'select', importance: 2 }, [
          item('m1', { variants: ['label'] }),
          item('m2', { variants: ['label'] }),
          item('m3', { variants: ['label'] }),
        ]),
      ],
    });
    // labels: 80*3 + 2*10 = 260. collapsed select = 50.
    const collapsed = solve(b, metrics(), 100);
    expect(collapsed.groups.get('modes')).toEqual({
      shedCount: 0,
      collapsed: true,
      overflowed: false,
    });
    expect(assignmentOf(collapsed, 'modes:m1')).toEqual({ kind: 'collapsed' });
    expect(collapsed.hasOverflow).toBe(false);
    expect(collapsed.width).toBe(50);

    // Below the collapsed width the WHOLE group overflows together.
    const gone = solve(b, metrics(), 45);
    expect(gone.groups.get('modes')).toEqual({ shedCount: 0, collapsed: true, overflowed: true });
    expect(assignmentOf(gone, 'modes:m1')).toEqual({ kind: 'overflow' });
    expect(gone.hasOverflow).toBe(true);
  });

  it('prefers degrading children variants over collapsing', () => {
    const b = bar({
      center: [
        group('modes', { collapse: 'select' }, [
          item('m1', { variants: ['icon+label', 'icon'] }),
          item('m2', { variants: ['icon+label', 'icon'] }),
        ]),
      ],
    });
    // richest 210; icons 90; collapsed 50. Budget 90 → icons, NOT collapsed.
    const fit = solve(b, metrics(), 90);
    expect(fit.groups.get('modes')).toEqual({ shedCount: 0, collapsed: false, overflowed: false });
    expect(assignmentOf(fit, 'modes:m1')).toEqual({ kind: 'variant', variant: 'icon' });
  });
});

describe('solve — shed (staged group degradation)', () => {
  it('sheds the rightmost child into the group disclosure, budgeting the trigger — NOT overflow', () => {
    const b = bar({
      start: [group('g', { shed: true }, [item('a'), item('b'), item('c'), item('d')])],
    });
    // icons: 4×40 + 3×10 = 190. Budget 150:
    //   shed d → a,b,c + trigger(36) = 156 + 3 gaps = 186 > 150
    //   shed c → a,b + trigger      = 116 + 2 gaps = 136 ≤ 150
    const fit = solve(b, metrics(), 150);
    expect(assignmentOf(fit, 'g:a')).toEqual({ kind: 'variant', variant: 'icon' });
    expect(assignmentOf(fit, 'g:b')).toEqual({ kind: 'variant', variant: 'icon' });
    expect(assignmentOf(fit, 'g:c')).toEqual({ kind: 'shed' });
    expect(assignmentOf(fit, 'g:d')).toEqual({ kind: 'shed' });
    expect(fit.groups.get('g')).toEqual({ shedCount: 2, collapsed: false, overflowed: false });
    // shed is group-local: no global overflow trigger appears
    expect(fit.hasOverflow).toBe(false);
    expect(fit.width).toBe(136);
  });

  it('never sheds below one visible child; without collapse, the whole group overflows at the floor', () => {
    const b = bar({
      start: [group('g', { shed: true }, [item('a'), item('b'), item('c'), item('d')])],
    });
    // Floor form is a + trigger = 40+36+10 = 86 > 60 → overflow-group (all
    // children, visible AND shed, leave together).
    const fit = solve(b, metrics(), 60);
    for (const key of ['g:a', 'g:b', 'g:c', 'g:d']) {
      expect(assignmentOf(fit, key)).toEqual({ kind: 'overflow' });
    }
    expect(fit.groups.get('g')).toEqual({ shedCount: 0, collapsed: false, overflowed: true });
    expect(fit.hasOverflow).toBe(true);
  });

  it('collapses at the floor when a collapsed form exists (shed → select)', () => {
    const b = bar({
      center: [
        group('modes', { shed: true, collapse: 'select' }, [item('m1'), item('m2'), item('m3')]),
      ],
    });
    // 3×40+2×10 = 140. Budget 70:
    //   shed m3 → 116+20 = 136 > 70 → shed m2 → 76+10 = 86 > 70
    //   floor reached → collapse → select (50) ≤ 70
    const fit = solve(b, metrics(), 70);
    expect(fit.groups.get('modes')).toEqual({ shedCount: 0, collapsed: true, overflowed: false });
    expect(assignmentOf(fit, 'modes:m1')).toEqual({ kind: 'collapsed' });
    // earlier sheds are subsumed by the stronger collapsed state
    expect(assignmentOf(fit, 'modes:m2')).toEqual({ kind: 'collapsed' });
    expect(fit.hasOverflow).toBe(false);
    expect(fit.width).toBe(50);
  });

  it('sheds before collapsing when both are possible', () => {
    const b = bar({
      center: [
        group('modes', { shed: true, collapse: 'select' }, [item('m1'), item('m2'), item('m3')]),
      ],
    });
    // Budget 100: shed m3 → m1,m2+trigger = 116+20 = 136 > 100 → shed m2 →
    // m1+trigger = 76+10 = 86 ≤ 100. Two tabs behind the chevron, NOT a select.
    const fit = solve(b, metrics(), 100);
    expect(fit.groups.get('modes')).toEqual({ shedCount: 2, collapsed: false, overflowed: false });
    expect(assignmentOf(fit, 'modes:m1')).toEqual({ kind: 'variant', variant: 'icon' });
    expect(assignmentOf(fit, 'modes:m2')).toEqual({ kind: 'shed' });
  });

  it('sheds by child importance, regardless of position', () => {
    const b = bar({
      start: [
        group('g', { shed: true }, [
          item('low', { importance: 1 }),
          item('high', { importance: 4 }),
          item('mid', { importance: 3 }),
        ]),
      ],
    });
    // 3×40+2×10 = 140. Budget 130: shed low (importance 1, leftmost!) →
    // 116+20 = 136 > 130 → shed mid (3 < 4) → high+trigger = 76+10 = 86.
    const fit = solve(b, metrics(), 130);
    expect(assignmentOf(fit, 'g:low')).toEqual({ kind: 'shed' });
    expect(assignmentOf(fit, 'g:mid')).toEqual({ kind: 'shed' });
    expect(assignmentOf(fit, 'g:high')).toEqual({ kind: 'variant', variant: 'icon' });
  });

  it('exhausts variant ladders before shedding', () => {
    const b = bar({
      start: [
        group('g', { shed: true }, [
          item('a', { variants: ['icon+label', 'icon'] }),
          item('b', { variants: ['icon+label', 'icon'] }),
        ]),
      ],
    });
    // richest 210; icons 90. Budget 90 → labels drop, nothing shed.
    const fit = solve(b, metrics(), 90);
    expect(assignmentOf(fit, 'g:a')).toEqual({ kind: 'variant', variant: 'icon' });
    expect(assignmentOf(fit, 'g:b')).toEqual({ kind: 'variant', variant: 'icon' });
    expect(fit.groups.get('g')!.shedCount).toBe(0);
  });
});

describe('solve — separators and sections', () => {
  it('counts a separator between adjacent visible groups in a section, and drops it when a group empties', () => {
    const b = bar({
      start: [group('g1', [item('a')]), group('g2', [item('b', { importance: 1 })])],
    });
    // a + b + gap + separator = 40+40+10+20 = 110
    const wide = solve(b, metrics(), 200);
    expect(wide.width).toBe(110);

    // b overflows: a + trigger + gap = 90 — no separator (g2 is empty).
    const tight = solve(b, metrics(), 100);
    expect(assignmentOf(tight, 'g2:b')).toEqual({ kind: 'overflow' });
    expect(tight.width).toBe(90);
  });

  it('does not count separators across sections', () => {
    const b = bar({
      start: [group('g1', [item('a')])],
      end: [group('g2', [item('b')])],
    });
    // 40 + 40 + gap = 90; no separator across sections.
    expect(solve(b, metrics(), 200).width).toBe(90);
  });
});

describe('solve — measurement gaps and determinism', () => {
  it('flags incomplete measurements and treats them as width 0', () => {
    const m = metrics();
    const partial: FitMetrics = {
      ...m,
      unit: (key, v) => (key === 'g:a' ? undefined : m.unit(key, v)),
    };
    const b = bar({ start: [group('g', [item('a'), item('b')])] });
    const fit = solve(b, partial, 1000);
    expect(fit.complete).toBe(false);
    expect(fit.hasOverflow).toBe(false);
  });

  it('is deterministic', () => {
    const b = bar({
      start: [group('g1', [item('a', { variants: ['icon+label', 'icon'] }), item('b')])],
      center: [group('g2', { collapse: 'menu' }, [item('c'), item('d')])],
    });
    const one = solve(b, metrics(), 137);
    const two = solve(b, metrics(), 137);
    expect(one.units).toEqual(two.units);
    expect(one.groups).toEqual(two.groups);
    expect(one.width).toBe(two.width);
  });

  it('is monotone: a smaller budget never rescues an overflowed unit', () => {
    const b = bar({
      start: [
        group('g1', [item('a', { variants: ['icon+label', 'icon'] }), item('b'), item('c')]),
        group('g2', { collapse: 'menu' }, [item('d'), item('e')]),
        group('g3', { shed: true, collapse: 'select' }, [item('f'), item('h'), item('j')]),
      ],
    });
    let previousOverflowed = new Set<string>();
    for (const budget of [400, 300, 250, 200, 150, 100, 50, 0]) {
      const fit = solve(b, metrics(), budget);
      const overflowed = new Set(
        [...fit.units.entries()].filter(([, a]) => a.kind === 'overflow').map(([k]) => k),
      );
      for (const key of previousOverflowed) {
        expect(overflowed.has(key), `budget ${budget} rescued ${key}`).toBe(true);
      }
      previousOverflowed = overflowed;
    }
  });
});
