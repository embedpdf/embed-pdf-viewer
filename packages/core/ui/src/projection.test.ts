import { describe, expect, it } from 'vitest';
import { group, item, custom, normalizeBar } from './schema';
import { solve, type FitMetrics } from './solver';
import { projectOverflow, projectShed, projectStrip, type ResolveMenuTarget } from './projection';

const metrics: FitMetrics = {
  unit: () => 40,
  groupCollapsed: () => 50,
  groupTrigger: () => 36,
  overflowTrigger: 40,
  gap: 10,
  separator: 20,
};

describe('projectOverflow', () => {
  /**
   * The v2 regression: at tiny widths the snippet's hand-written
   * 'left-action-menu' showed
   *
   *   View controls  ▸
   *   Zoom controls  ▸
   *   ────────────────
   *   Toggle pan mode
   *   Toggle pointer mode
   *
   * ([viewers/snippet] ui-schema.ts 'left-action-menu'). Here the same menu
   * DERIVES from the main-bar structure + the commands' menu targets.
   */
  it('reproduces the v2 left-action-menu from the main bar schema', () => {
    const bar = normalizeBar({
      id: 'main',
      sections: {
        start: [
          group('workspace', [
            item('panel:sidebar', { importance: 5 }), // pinned — stays in the bar
            item('page:settings'),
          ]),
        ],
        center: [
          group('zoom', [custom('zoom-controls', { variants: ['inline'], terminal: 'zoom:menu' })]),
          group('tools', ['pan:toggle', 'pointer:toggle']),
        ],
      },
    });
    const resolve: ResolveMenuTarget = (id) =>
      ({
        'page:settings': { menu: 'page-settings' },
        'zoom:menu': { menu: 'zoom' },
      })[id] ?? {};

    // Budget forces everything non-pinned into overflow: pinned icon (40) +
    // trigger (40) + gap (10) = 90.
    const fit = solve(bar, metrics, 90);
    const sections = projectOverflow(bar, fit, resolve);

    expect(sections).toEqual([
      {
        labelKey: undefined,
        role: undefined,
        rows: [{ type: 'submenu', command: 'page:settings', menu: 'page-settings' }],
      },
      {
        labelKey: undefined,
        role: undefined,
        rows: [{ type: 'submenu', command: 'zoom:menu', menu: 'zoom' }],
      },
      {
        labelKey: undefined,
        role: undefined,
        rows: [
          { type: 'command', command: 'pan:toggle' },
          { type: 'command', command: 'pointer:toggle' },
        ],
      },
    ]);
  });

  it('projects only the overflowed part of a partially-overflowed group, in schema order', () => {
    const bar = normalizeBar({
      id: 'b',
      sections: { start: [group('g', ['a', 'b', 'c'])] },
    });
    // icons 3×40 + 2 gaps = 140. Budget 140 → all fit → empty projection.
    expect(projectOverflow(bar, solve(bar, metrics, 140), () => ({}))).toEqual([]);
    // Budget 100 → c and b shed (rightmost first).
    const sections = projectOverflow(bar, solve(bar, metrics, 100), () => ({}));
    expect(sections).toEqual([
      {
        labelKey: undefined,
        role: undefined,
        rows: [
          { type: 'command', command: 'b' },
          { type: 'command', command: 'c' },
        ],
      },
    ]);
  });

  it('marks tab groups as radio sections and carries the group labelKey', () => {
    const bar = normalizeBar({
      id: 'b',
      sections: {
        center: [
          group('modes', { role: 'tabs', collapse: 'select', labelKey: 'toolbar.modes' }, [
            item('mode:view', { variants: ['label'] }),
            item('mode:annotate', { variants: ['label'] }),
          ]),
        ],
      },
    });
    // Below the collapsed width, the whole tabs group overflows together.
    const fit = solve(bar, metrics, 45);
    expect(fit.groups.get('modes')).toEqual({ shedCount: 0, collapsed: true, overflowed: true });
    expect(projectOverflow(bar, fit, () => ({}))).toEqual([
      {
        labelKey: 'toolbar.modes',
        role: 'radio',
        rows: [
          { type: 'command', command: 'mode:view' },
          { type: 'command', command: 'mode:annotate' },
        ],
      },
    ]);
  });

  it('projects a custom item through its terminal command', () => {
    const bar = normalizeBar({
      id: 'b',
      sections: {
        start: [group('zoom', [custom('zoom-controls', { terminal: 'zoom:menu', importance: 1 })])],
        end: [group('other', [item('keep', { importance: 5 })])],
      },
    });
    // 89 < zoom-controls + keep + gap (90): the low-importance custom item sheds.
    const fit = solve(bar, metrics, 89);
    expect(projectOverflow(bar, fit, () => ({ menu: 'zoom' }))).toEqual([
      {
        labelKey: undefined,
        role: undefined,
        rows: [{ type: 'submenu', command: 'zoom:menu', menu: 'zoom' }],
      },
    ]);
  });

  it('keeps shed units OUT of the global overflow — they project via projectShed', () => {
    const bar = normalizeBar({
      id: 'b',
      sections: { start: [group('tabs', { role: 'tabs', shed: true }, ['t1', 't2', 't3'])] },
    });
    // 3×40+2×10 = 140. Budget 120: shed t3 → 116+20 = 136 > 120 → shed t2 →
    // t1 + trigger = 76+10 = 86 ≤ 120.
    const fit = solve(bar, metrics, 120);
    expect(projectOverflow(bar, fit, () => ({}))).toEqual([]);
    expect(projectShed(bar.sections[0].groups[0], fit, () => ({}))).toEqual([
      { type: 'command', command: 't2' },
      { type: 'command', command: 't3' },
    ]);
  });

  it('projects a fully-overflowed shed group globally (radio section), with an empty disclosure', () => {
    const bar = normalizeBar({
      id: 'b',
      sections: { start: [group('tabs', { role: 'tabs', shed: true }, ['t1', 't2', 't3'])] },
    });
    // Floor (t1 + trigger = 86) doesn't fit in 50 → the whole group overflows.
    const fit = solve(bar, metrics, 50);
    expect(projectShed(bar.sections[0].groups[0], fit, () => ({}))).toEqual([]);
    expect(projectOverflow(bar, fit, () => ({}))).toEqual([
      {
        labelKey: undefined,
        role: 'radio',
        rows: [
          { type: 'command', command: 't1' },
          { type: 'command', command: 't2' },
          { type: 'command', command: 't3' },
        ],
      },
    ]);
  });

  it('projects unknown commands as plain rows (resolve returns null)', () => {
    const bar = normalizeBar({ id: 'b', sections: { start: [group('g', ['mystery'])] } });
    const fit = solve(bar, metrics, 0);
    expect(projectOverflow(bar, fit, () => null)).toEqual([
      { labelKey: undefined, role: undefined, rows: [{ type: 'command', command: 'mystery' }] },
    ]);
  });
});

describe('projectStrip', () => {
  // The annotation strip: actions + a separated danger group, visibility
  // decided per-command by the registry (group only when groupable, …).
  const strip = normalizeBar({
    id: 'annotation-strip',
    sections: {
      center: [
        group('actions', ['annotation:comment', 'annotation:style', 'annotation:group']),
        group('danger', ['annotation:delete']),
      ],
    },
  });

  it('keeps bar order and group boundaries for visible commands', () => {
    expect(projectStrip(strip, () => true)).toEqual([
      {
        id: 'actions',
        labelKey: undefined,
        commands: ['annotation:comment', 'annotation:style', 'annotation:group'],
      },
      { id: 'danger', labelKey: undefined, commands: ['annotation:delete'] },
    ]);
  });

  it('drops hidden commands and vanishes groups that empty out', () => {
    const visible = (id: string) => id === 'annotation:delete';
    expect(projectStrip(strip, visible)).toEqual([
      { id: 'danger', labelKey: undefined, commands: ['annotation:delete'] },
    ]);
  });

  it('projects an all-hidden bar to [] — "render nothing" falls out', () => {
    expect(projectStrip(strip, () => false)).toEqual([]);
  });

  it('projects custom units through their terminal command', () => {
    const bar = normalizeBar({
      id: 'b',
      sections: {
        start: [group('g', [custom('zoom-controls', { terminal: 'zoom:menu' }), 'zoom:in'])],
      },
    });
    expect(projectStrip(bar, () => true)).toEqual([
      { id: 'g', labelKey: undefined, commands: ['zoom:menu', 'zoom:in'] },
    ]);
  });
});
