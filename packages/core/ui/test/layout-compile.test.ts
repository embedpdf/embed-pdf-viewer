import { describe, expect, it } from 'vitest';

import type { LayoutData } from '../src/layout';
import {
  FLOAT_POSITIONS,
  barsAt,
  barsFloating,
  barsInMode,
  barsInPanel,
  barsOnEdge,
  barsWith,
  compileBar,
  edgeOf,
  edgeStackOf,
  floatOf,
  floatStackOf,
  menuOf,
  modesOf,
  omittedCommandsOf,
  panelOf,
  tabsOf,
  type OmissionCommand,
} from '../src/layout-compile';
import { normalizeBar } from '../src/schema';

const data: LayoutData = {
  bars: {
    main: {
      place: 'top',
      start: [
        { id: 'document', items: ['menu:document'], importance: 5 },
        {
          id: 'zoom',
          items: [{ custom: 'zoom', command: 'menu:zoom', variants: ['inline', 'button'] }],
        },
        ['tool:pointer', 'tool:pan'],
      ],
      center: [
        {
          id: 'modes',
          items: [],
          shed: true,
          collapse: 'select',
          importance: 4,
          titleKey: 'commands.mode.group',
        },
      ],
      end: ['document:download'],
    },
    annotate: { place: { with: 'main' }, mode: 'annotate', center: [['tool:highlight']] },
    shapes: { place: { with: 'main' }, mode: 'shapes', center: [['tool:square']] },
    pager: { place: { float: 'bottom' }, center: [[{ custom: 'page-number' }]] },
    selection: { place: { at: 'selection' }, center: [['selection:copy']] },
    annotation: { place: { at: 'annotation' }, center: [['annotation:delete']] },
    pages: { place: { panel: 'thumbnails' }, start: [['page:delete']] },
    pageHistory: { place: { panel: 'thumbnails' }, end: [['history:undo']] },
  },
  menus: {
    document: [['document:download', 'document:print'], [], ['view:fullscreen']],
    view: [
      {
        titleKey: 'commands.scroll.group',
        items: ['view:scroll-vertical', 'view:scroll-vertical'],
      },
    ],
  },
};

describe('places', () => {
  it('reads the edge of a place', () => {
    expect(edgeOf('top')).toBe('top');
    expect(edgeOf({ edge: 'start', after: 'main' })).toBe('start');
    expect(edgeOf({ float: 'bottom' })).toBeNull();
    expect(edgeOf({ with: 'main' })).toBeNull();
    expect(edgeOf('sideways' as never)).toBeNull();
  });

  it('stacks the bars on an edge in the order they were added, outside first', () => {
    const stacked: LayoutData = {
      bars: {
        main: { place: 'top' },
        rail: { place: 'start' },
        second: { place: { edge: 'top' } },
      },
    };
    expect(barsOnEdge(stacked, 'top')).toEqual(['main', 'second']);
    expect(barsOnEdge(stacked, 'start')).toEqual(['rail']);
    expect(barsOnEdge(stacked, 'bottom')).toEqual([]);
  });

  it('puts a bar before or after the bar it names, even one placed the same way', () => {
    const stacked: LayoutData = {
      bars: {
        review: { place: { edge: 'top', after: 'main' } },
        main: { place: 'top' },
        outer: { place: { edge: 'top', before: 'main' } },
        inner: { place: { edge: 'top', after: 'review' } },
        last: { place: 'top' },
      },
    };
    expect(barsOnEdge(stacked, 'top')).toEqual(['outer', 'main', 'review', 'inner', 'last']);
  });

  it('puts a bar that names a bar not on its edge innermost', () => {
    const stacked: LayoutData = {
      bars: {
        lost: { place: { edge: 'top', after: 'rail' } },
        main: { place: 'top' },
        rail: { place: 'start' },
      },
    };
    expect(barsOnEdge(stacked, 'top')).toEqual(['main', 'lost']);
  });

  it('lists the bars along a bar, over a selection, in a panel, and in a mode', () => {
    expect(barsWith(data, 'main')).toEqual(['annotate', 'shapes']);
    expect(barsAt(data, 'selection')).toEqual(['selection']);
    expect(barsAt(data, 'annotation')).toEqual(['annotation']);
    expect(barsInPanel(data, 'thumbnails')).toEqual(['pages', 'pageHistory']);
    expect(barsInPanel(data, 'outline')).toEqual([]);
    expect(panelOf(data.bars!.pages!.place)).toBe('thumbnails');
    expect(panelOf(data.bars!.main!.place)).toBeNull();
    // A panel's bar is on no edge and floats nowhere.
    expect(edgeOf(data.bars!.pages!.place)).toBeNull();
    expect(floatOf(data.bars!.pages!.place)).toBeNull();
    expect(modesOf(data)).toEqual(['annotate', 'shapes']);
    expect(barsInMode(data, 'shapes')).toEqual(['shapes']);
  });
});

describe('compileBar', () => {
  it('gives the toolbar a bar: groups with ids, items as the toolbar names them', () => {
    const bar = compileBar(data, 'main')!;
    expect(bar.id).toBe('main');
    expect(bar.sections.start).toEqual([
      { id: 'document', items: ['menu:document'], importance: 5 },
      {
        id: 'zoom',
        items: [{ slot: 'zoom', terminal: 'menu:zoom', variants: ['inline', 'button'] }],
      },
      { id: 'start-2', items: ['tool:pointer', 'tool:pan'] },
    ]);
    expect(bar.sections.end).toEqual([{ id: 'end-0', items: ['document:download'] }]);
    expect(() => normalizeBar(bar)).not.toThrow();
  });

  it('lists View and one tab per mode in the modes group, as tabs', () => {
    const modes = compileBar(data, 'main')!.sections.center![0]!;
    expect(modes).toEqual({
      id: 'modes',
      role: 'tabs',
      labelKey: 'commands.mode.group',
      shed: true,
      collapse: 'select',
      importance: 4,
      items: [
        { command: 'mode:view', variants: ['label'], importance: 1 },
        { command: 'mode:annotate', variants: ['label'], importance: 1 },
        { command: 'mode:shapes', variants: ['label'], importance: 1 },
      ],
    });
  });

  it('adds a tab for a new mode bar, and drops one for a removed mode bar', () => {
    const withReview: LayoutData = {
      bars: {
        ...data.bars,
        review: { place: { with: 'main' }, mode: 'review', title: 'Review' },
      },
    };
    const commands = (layout: LayoutData) =>
      compileBar(layout, 'main')!.sections.center![0]!.items.map(
        (item) => (item as { command: string }).command,
      );
    expect(commands(withReview)).toEqual([
      'mode:view',
      'mode:annotate',
      'mode:shapes',
      'mode:review',
    ]);
    const { annotate: _annotate, ...rest } = data.bars!;
    expect(commands({ bars: rest })).toEqual(['mode:view', 'mode:shapes']);
  });

  it('leaves out omitted commands, and View with the last mode tab', () => {
    const omitted = compileBar(data, 'main', {
      omit: new Set(['mode:annotate', 'document:download']),
    })!;
    expect(omitted.sections.center![0]!.items).toEqual([
      { command: 'mode:view', variants: ['label'], importance: 1 },
      { command: 'mode:shapes', variants: ['label'], importance: 1 },
    ]);
    expect(omitted.sections.end).toBeUndefined();
    const noModes = compileBar(data, 'main', { omit: new Set(['mode:annotate', 'mode:shapes']) })!;
    expect(noModes.sections.center).toBeUndefined();
  });

  it('keeps your own components when their command is omitted', () => {
    const bar = compileBar(data, 'main', { omit: new Set(['menu:zoom', 'zoom']) })!;
    expect(bar.sections.start![1]!.items).toEqual([
      { slot: 'zoom', terminal: 'menu:zoom', variants: ['inline', 'button'] },
    ]);
  });

  it('turns your own component without a command into a pinned item', () => {
    const pager = compileBar(data, 'pager')!;
    expect(pager.sections.center).toEqual([{ id: 'center-0', items: [{ slot: 'page-number' }] }]);
    const unit = normalizeBar(pager).sections[0]!.groups[0]!.units[0]!;
    expect(unit).toMatchObject({ kind: 'custom', terminal: null, importance: 5 });
  });

  it('shows an item once per group, and gives a repeated group id a new one', () => {
    const repeated: LayoutData = {
      bars: {
        main: {
          place: 'top',
          start: [
            { id: 'tools', items: ['tool:pan', 'tool:pan'] },
            { id: 'tools', items: ['tool:ink'] },
          ],
        },
      },
    };
    const bar = compileBar(repeated, 'main')!;
    expect(bar.sections.start).toEqual([
      { id: 'tools', items: ['tool:pan'] },
      { id: 'tools-2', items: ['tool:ink'] },
    ]);
    expect(() => normalizeBar(bar)).not.toThrow();
  });

  it('is null for a bar the layout does not have', () => {
    expect(compileBar(data, 'nope')).toBeNull();
  });
});

describe('menuOf', () => {
  it('reads sections with their titles, without empty sections or repeats', () => {
    expect(menuOf(data, 'document')).toEqual([
      { items: ['document:download', 'document:print'] },
      { items: ['view:fullscreen'] },
    ]);
    expect(menuOf(data, 'view')).toEqual([
      { titleKey: 'commands.scroll.group', items: ['view:scroll-vertical'] },
    ]);
    expect(menuOf(data, 'nope')).toBeNull();
  });
});

describe('edgeStackOf', () => {
  it('lists each edge bar followed by the bars riding along it, and theirs', () => {
    const stacked: LayoutData = {
      bars: {
        main: { place: 'top' },
        annotate: { place: { with: 'main' }, mode: 'annotate' },
        review: { place: { edge: 'top', after: 'main' } },
        notes: { place: { with: 'annotate' } },
        shapes: { place: { with: 'main' }, mode: 'shapes' },
        rail: { place: 'start' },
      },
    };
    expect(edgeStackOf(stacked, 'top')).toEqual(['main', 'annotate', 'notes', 'shapes', 'review']);
    expect(edgeStackOf(stacked, 'start')).toEqual(['rail']);
  });

  it('stops at a loop of bars riding along each other', () => {
    const loop: LayoutData = {
      bars: {
        main: { place: 'top' },
        left: { place: { with: 'main' } },
        right: { place: { with: 'left' } },
      },
    };
    expect(edgeStackOf(loop, 'top')).toEqual(['main', 'left', 'right']);
  });
});

describe('floating bars', () => {
  it('reads where a place floats', () => {
    expect(floatOf({ float: 'bottom-end' })).toBe('bottom-end');
    expect(floatOf('top')).toBeNull();
    expect(floatOf({ with: 'main' })).toBeNull();
    expect(floatOf({ float: 'middle' } as never)).toBeNull();
    expect(FLOAT_POSITIONS).toHaveLength(8);
  });

  it('lists the bars at each position in the order they were added, each with its riders', () => {
    const floating: LayoutData = {
      bars: {
        pager: { place: { float: 'bottom' } },
        zoom: { place: { float: 'bottom-end' } },
        notes: { place: { with: 'pager' } },
        second: { place: { float: 'bottom' } },
        main: { place: 'top' },
      },
    };
    expect(barsFloating(floating, 'bottom')).toEqual(['pager', 'second']);
    expect(floatStackOf(floating, 'bottom')).toEqual(['pager', 'notes', 'second']);
    expect(floatStackOf(floating, 'bottom-end')).toEqual(['zoom']);
    expect(floatStackOf(floating, 'top')).toEqual([]);
    // A floating bar is on no edge.
    expect(edgeStackOf(floating, 'bottom')).toEqual([]);
  });
});

describe('tabsOf', () => {
  it('shows the document tabs while more than one document is open, unless the layout says', () => {
    expect(tabsOf({})).toBe('multiple');
    expect(tabsOf({ tabs: 'always' })).toBe('always');
    expect(tabsOf({ tabs: 'never' })).toBe('never');
  });
});

describe('omittedCommandsOf', () => {
  const commands = (
    visible: readonly string[],
    menus: Readonly<Record<string, string>> = {},
  ): ((id: string) => OmissionCommand | null) => {
    const shown = new Set(visible);
    return (id) => ({ visible: shown.has(id), menu: menus[id] });
  };
  const everything = [
    'menu:document',
    'menu:zoom',
    'tool:pointer',
    'tool:pan',
    'document:download',
    'document:print',
    'view:fullscreen',
    'view:scroll-vertical',
    'tool:highlight',
    'tool:square',
  ];

  it('leaves out nothing while everything shows', () => {
    expect(omittedCommandsOf(data, commands(everything, { 'menu:document': 'document' }))).toEqual(
      [],
    );
  });

  it('leaves out the tab of a mode whose bars show nothing', () => {
    const hidden = everything.filter((id) => id !== 'tool:square');
    expect(omittedCommandsOf(data, commands(hidden))).toEqual(['mode:shapes']);
  });

  it('leaves out a button whose menu has nothing visible, or no menu at all', () => {
    const openers = { 'menu:document': 'document', 'tool:pan': 'nowhere' };
    const hidden = everything.filter(
      (id) => !['document:download', 'document:print', 'view:fullscreen'].includes(id),
    );
    expect(omittedCommandsOf(data, commands(hidden, openers))).toEqual([
      'menu:document',
      'tool:pan',
    ]);
  });

  it('keeps a mode whose only item is your own component without a command', () => {
    const custom: LayoutData = {
      bars: { notes: { place: { with: 'main' }, mode: 'notes', center: [[{ custom: 'pad' }]] } },
    };
    expect(omittedCommandsOf(custom, commands([]))).toEqual([]);
  });
});

describe('data of the wrong shape', () => {
  const broken = {
    bars: {
      main: {
        place: 'top',
        start: [[42, 'tool:pan', null], { id: 'x', items: 'tool:pointer' }],
        end: 'tool:pan',
      },
      nothing: null,
      noPlace: { center: [['tool:ink']] },
    },
    menus: { document: 'document:print', view: [7, { items: [8, 'view:fullscreen'] }] },
  } as unknown as LayoutData;

  it('is skipped, never thrown on', () => {
    expect(compileBar(broken, 'main')).toEqual({
      id: 'main',
      sections: { start: [{ id: 'start-0', items: ['tool:pan'] }] },
    });
    expect(compileBar(broken, 'nothing')).toBeNull();
    expect(barsOnEdge(broken, 'top')).toEqual(['main']);
    expect(edgeStackOf(broken, 'top')).toEqual(['main']);
    expect(menuOf(broken, 'document')).toEqual([]);
    expect(menuOf(broken, 'view')).toEqual([{ items: ['view:fullscreen'] }]);
    expect(omittedCommandsOf(broken, () => null)).toEqual([]);
  });
});

describe('dependent groups in a layout', () => {
  const history = { id: 'history', items: ['history:undo', 'history:redo'], dependent: true };
  const withHistory: LayoutData = {
    bars: {
      main: {
        place: 'top',
        start: [['menu:edit']],
        center: [{ id: 'modes', items: [] }],
      },
      annotate: {
        place: { with: 'main' },
        mode: 'annotate',
        center: [['tool:highlight'], history],
      },
      insert: { place: { with: 'main' }, mode: 'insert', center: [['tool:stamp'], history] },
    },
    menus: { edit: [['history:undo', 'history:redo']] },
  };
  const commands =
    (visible: readonly string[]) =>
    (id: string): OmissionCommand => ({
      visible: visible.includes(id),
      menu: id === 'menu:edit' ? 'edit' : undefined,
    });

  it('compile with the group', () => {
    expect(compileBar(withHistory, 'annotate')!.sections.center).toEqual([
      { id: 'center-0', items: ['tool:highlight'] },
      { id: 'history', items: ['history:undo', 'history:redo'], dependent: true },
    ]);
  });

  it("don't hold up a mode's tab on their own", () => {
    const shown = ['menu:edit', 'history:undo', 'history:redo', 'tool:highlight'];
    expect(omittedCommandsOf(withHistory, commands(shown))).toEqual(['mode:insert']);
    expect(omittedCommandsOf(withHistory, commands(['history:undo', 'history:redo']))).toEqual([
      'mode:annotate',
      'mode:insert',
    ]);
  });

  it('take nothing from a menu: it has no groups, so its button stays while undo shows', () => {
    expect(omittedCommandsOf(withHistory, commands(['menu:edit', 'history:undo']))).not.toContain(
      'menu:edit',
    );
  });

  it('take every mode tab, and View, once only they are left', () => {
    const omit = new Set(omittedCommandsOf(withHistory, commands(['history:undo'])));
    expect(compileBar(withHistory, 'main', { omit })!.sections.center).toBeUndefined();
  });
});
