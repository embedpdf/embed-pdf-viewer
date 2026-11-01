import { describe, expect, it } from 'vitest';

import { createLayout, type LayoutData } from '../src/layout';
import { validateLayout } from '../src/layout-validate';

const commands = [
  'menu:document',
  'tool:pan',
  'tool:pointer',
  'tool:highlight',
  'panel:search',
  'document:download',
  'document:print',
  'view:fullscreen',
  'menu:zoom',
];

const valid: LayoutData = {
  bars: {
    main: {
      place: 'top',
      start: [['menu:document'], [{ custom: 'zoom', command: 'menu:zoom' }]],
      center: [{ id: 'modes', items: [] }],
      end: [['panel:search', 'panel:comments']],
    },
    annotate: {
      place: { with: 'main' },
      mode: 'annotate',
      titleKey: 'commands.mode.annotate',
      center: [['tool:highlight']],
    },
    review: { place: { edge: 'top', after: 'main' }, center: [['mode:view', 'mode:annotate']] },
    pager: { place: { float: 'bottom' }, center: [[{ custom: 'page-number' }]] },
    selection: { place: { at: 'selection' } },
  },
  menus: { document: [['document:download'], { title: 'More', items: ['view:fullscreen'] }] },
  panels: { comments: { side: 'end', present: 'overlay', width: 320 } },
  tabs: 'multiple',
};

describe('validateLayout', () => {
  it('finds nothing wrong with a layout whose ids all exist', () => {
    expect(validateLayout(valid, { commands })).toEqual([]);
    expect(validateLayout(createLayout(valid), { commands })).toEqual([]);
  });

  it('knows the mode tabs and panel buttons the layout makes itself', () => {
    // mode:view, mode:annotate (a bar's mode) and panel:comments (a panel) are not in `commands`.
    expect(validateLayout(valid, { commands })).toEqual([]);
  });

  it('names an unknown command with the closest one that exists', () => {
    const typo: LayoutData = {
      bars: { main: { place: 'top', start: [['tool:pann', 'acme:mine']] } },
      menus: { document: [['document:downlaod']] },
    };
    expect(validateLayout(typo, { commands })).toEqual([
      'bar "main": no command "tool:pann" (did you mean "tool:pan"?)',
      'bar "main": no command "acme:mine"',
      'menu "document": no command "document:downlaod" (did you mean "document:download"?)',
    ]);
  });

  it('asks hasCommand about ids a list can not hold, such as a family’s', () => {
    const family: LayoutData = { menus: { zoom: [['zoom:125', 'zoom:nope']] } };
    expect(
      validateLayout(family, {
        commands,
        hasCommand: (id) => /^zoom:\d+$/.test(id),
      }),
    ).toEqual(['menu "zoom": no command "zoom:nope"']);
  });

  it('checks the command your own component stands for, not its id', () => {
    const custom: LayoutData = {
      bars: { main: { place: 'top', start: [[{ custom: 'versions', command: 'acme:versions' }]] } },
    };
    expect(validateLayout(custom, { commands })).toEqual([
      'bar "main": no command "acme:versions"',
    ]);
  });

  it('puts what the edits could not do first', () => {
    const layout = createLayout(valid).remove('tool:pann', { from: 'main' });
    expect(validateLayout(layout, { commands })).toEqual(['remove: "tool:pann" is not in "main"']);
  });

  it('checks every kind of place', () => {
    const places: LayoutData = {
      bars: {
        main: { place: 'top' },
        rail: { place: 'start' },
        none: {} as never,
        sideways: { place: 'sideways' as never },
        odd: { place: { edge: 'middle' as never } },
        lost: { place: { edge: 'top', after: 'mian' } },
        wrongEdge: { place: { edge: 'top', before: 'rail' } },
        floating: { place: { float: 'bottom-middle' as never } },
        self: { place: { with: 'self' } },
        orphan: { place: { with: 'mian' } },
        loopA: { place: { with: 'loopB' } },
        loopB: { place: { with: 'loopA' } },
        selected: { place: { at: 'everything' as never } },
        paneled: { place: { panel: 'coments' } },
        unknown: { place: { near: 'main' } as never },
      },
      panels: { comments: { side: 'end' } },
    };
    expect(validateLayout(places, { commands })).toEqual([
      'bar "none" has no place',
      'bar "sideways": "sideways" is not a place (an edge, { edge, before | after }, { float }, { with }, { at } or { panel })',
      'bar "odd": "middle" is not an edge',
      'bar "lost" goes after "mian": no such bar (did you mean "main"?)',
      'bar "wrongEdge" goes before "rail", which is not on the top edge',
      'bar "floating": "bottom-middle" is not a floating position',
      'bar "self" rides along itself',
      'bar "orphan" rides along "mian": no such bar (did you mean "main"?)',
      'bar "loopA" rides along a bar that rides along it',
      'bar "loopB" rides along a bar that rides along it',
      'bar "selected": "everything" is not selection or annotation',
      'bar "paneled" goes in "coments": no such panel (did you mean "comments"?)',
      'bar "unknown": {"near":"main"} is not a place (an edge, { edge, before | after }, { float }, { with }, { at } or { panel })',
    ]);
  });

  it('warns about a mode bar with no title and no command of its own', () => {
    const untitled: LayoutData = {
      bars: {
        review: { place: { with: 'main' }, mode: 'review' },
        main: { place: 'top' },
      },
    };
    expect(validateLayout(untitled, { commands })).toEqual([
      'bar "review": its mode "review" has no title, so its tab reads "review"',
    ]);
    expect(validateLayout(untitled, { commands: [...commands, 'mode:review'] })).toEqual([]);
  });

  it('warns about repeats: an item twice in a group, two groups with one id, a command twice in a menu', () => {
    const repeats: LayoutData = {
      bars: {
        main: {
          place: 'top',
          start: [
            { id: 'tools', items: ['tool:pan', 'tool:pan'] },
            { id: 'tools', items: ['tool:pointer'] },
          ],
        },
      },
      menus: { document: [['document:print'], ['document:print']] },
    };
    expect(validateLayout(repeats, { commands })).toEqual([
      'bar "main": "tool:pan" is twice in one group',
      'bar "main": two groups are called "tools"',
      'menu "document": "document:print" is in it twice',
    ]);
  });

  it('warns about what is not an item, a section or a menu', () => {
    const shapes: LayoutData = {
      bars: { main: { place: 'top', start: [[42 as never]], end: 'tool:pan' as never } },
      menus: { document: 'document:print' as never, view: [[7 as never]] },
    };
    expect(validateLayout(shapes, { commands })).toEqual([
      'bar "main": 42 is not an item',
      'bar "main": its end section is not a list of groups',
      'menu "document" is not a list of sections',
      'menu "view": 7 is not a command id',
    ]);
  });

  it('checks panels and tabs', () => {
    const wrong: LayoutData = {
      panels: {
        notes: { side: 'left' as never, present: 'float' as never, width: -1 },
        fine: { side: 'start' },
      },
      tabs: 'sometimes' as never,
    };
    expect(validateLayout(wrong, { commands })).toEqual([
      'panel "notes": side "left" is not start or end',
      'panel "notes": present "float" is not dock, overlay or sheet',
      'panel "notes": width -1 is not a width in px',
      'tabs: "sometimes" is not one of always, multiple or never',
    ]);
  });

  it('checks a panel’s present per size, its width limits and resizable', () => {
    const wrong: LayoutData = {
      panels: {
        notes: {
          present: { compact: 'overlay', medum: 'dock', expanded: 'float' } as never,
          width: { initial: 300, min: 400, max: 320, widest: 9 } as never,
          resizable: 'no' as never,
        },
        fine: { present: { compact: 'overlay' }, width: { initial: 320, min: 240, max: 480 } },
      },
    };
    expect(validateLayout(wrong, { commands })).toEqual([
      'panel "notes": present has "medum", not a size (did you mean "medium"?)',
      'panel "notes": present.expanded "float" is not dock, overlay or sheet',
      'panel "notes": width has "widest", not initial, min or max',
      'panel "notes": width.min 400 is wider than width.max 320',
      'panel "notes": resizable "no" is not true or false',
    ]);
  });

  it('says so when the layout is not an object', () => {
    expect(validateLayout(null as never, { commands })).toEqual(['the layout is not an object']);
  });
});

describe('dependent groups, checked', () => {
  it('names a dependent that is not true or false, and a bar of dependent groups only', () => {
    const problems = validateLayout(
      {
        bars: {
          main: {
            place: 'top',
            start: [['tool:pan'], { id: 'odd', items: ['tool:pointer'], dependent: 'yes' }],
          },
          alone: {
            place: 'bottom',
            center: [{ id: 'history', items: ['tool:highlight'], dependent: true }],
          },
        },
      } as unknown as LayoutData,
      { commands },
    );
    expect(problems).toEqual([
      'bar "main": group "odd" has dependent "yes", which is not true or false',
      'bar "alone": every group in it is dependent, so it never shows',
    ]);
  });
});
