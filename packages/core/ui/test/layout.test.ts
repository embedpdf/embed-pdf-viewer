import { describe, expect, it } from 'vitest';

import {
  createLayout,
  isLayout,
  layoutWarningsOf,
  resolveLayout,
  sameLayoutEnv,
  sizeOf,
  type LayoutData,
  type LayoutEnv,
} from '../src/layout';

const base: LayoutData = {
  bars: {
    main: {
      place: 'top',
      start: [
        { id: 'document', items: ['menu:document'], importance: 5 },
        { id: 'zoom', items: [{ custom: 'zoom', command: 'menu:zoom' }] },
        { id: 'tools', items: ['tool:pointer', 'tool:pan'] },
      ],
      center: [{ id: 'modes', items: [], collapse: 'select' }],
      end: [{ id: 'panels', items: ['panel:search', 'panel:comments'] }],
    },
    annotate: {
      place: { with: 'main' },
      mode: 'annotate',
      titleKey: 'commands.mode.annotate',
      center: [['tool:highlight', 'tool:underline'], 'history:undo'],
    },
    selection: { place: { at: 'selection' }, center: [['selection:copy']] },
  },
  menus: {
    document: [['document:download', 'document:print'], ['view:fullscreen']],
    view: [{ titleKey: 'commands.scroll.group', items: ['view:scroll-vertical'] }],
  },
  panels: { comments: { side: 'end' }, thumbnails: { side: 'start' } },
};

const env: LayoutEnv = { size: 'expanded', width: 1280, touch: false, dir: 'ltr' };

describe('createLayout', () => {
  it('gives back its data unchanged', () => {
    const layout = createLayout(base);
    expect(layout.toJSON()).toBe(base);
    expect(isLayout(layout)).toBe(true);
    expect(isLayout(base)).toBe(false);
  });

  it('never changes when edited: every edit returns a new layout', () => {
    const layout = createLayout(base);
    const moved = layout.place('main', 'bottom');
    expect(moved).not.toBe(layout);
    expect(layout.toJSON().bars!.main!.place).toBe('top');
    expect(moved.toJSON().bars!.main!.place).toBe('bottom');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(createLayout(base))).toBe(true);
  });
});

describe('place', () => {
  it('moves a bar and keeps its sections', () => {
    const next = createLayout(base).place('main', { edge: 'top', after: 'review' }).toJSON();
    expect(next.bars!.main!.place).toEqual({ edge: 'top', after: 'review' });
    expect(next.bars!.main!.start).toBe(base.bars!.main!.start);
  });

  it('warns about an unknown bar with the closest id and changes nothing', () => {
    const layout = createLayout(base).place('mian', 'bottom');
    expect(layout.toJSON()).toBe(base);
    expect(layoutWarningsOf(layout)).toEqual(['place: no bar "mian" (did you mean "main"?)']);
  });
});

describe('addBar and removeBar', () => {
  it('adds a bar, and replaces one with the same id', () => {
    const review = { place: 'bottom' as const, center: [['acme:approve']] };
    const added = createLayout(base).addBar('review', review).toJSON();
    expect(added.bars!.review).toBe(review);
    expect(Object.keys(added.bars!)).toEqual(['main', 'annotate', 'selection', 'review']);
    const replaced = createLayout(base).addBar('main', review).toJSON();
    expect(replaced.bars!.main).toBe(review);
  });

  it('removes a bar, and warns about one it does not have', () => {
    const layout = createLayout(base).removeBar('anotate').removeBar('annotate');
    expect(Object.keys(layout.toJSON().bars!)).toEqual(['main', 'selection']);
    expect(layoutWarningsOf(layout)).toEqual([
      'removeBar: no bar "anotate" (did you mean "annotate"?)',
    ]);
  });
});

describe('add', () => {
  it('puts an item in a new group at the end of the end section by default', () => {
    const end = createLayout(base).add('document:print', { to: 'main' }).toJSON().bars!.main!.end;
    expect(end).toEqual([
      { id: 'panels', items: ['panel:search', 'panel:comments'] },
      ['document:print'],
    ]);
  });

  it('puts an item at the end of a section', () => {
    const start = createLayout(base)
      .add('document:print', { to: 'main', section: 'start' })
      .toJSON().bars!.main!.start!;
    expect(start.at(-1)).toEqual(['document:print']);
  });

  it('joins a group by id, wherever it is in the bar', () => {
    const tools = createLayout(base).add('tool:ink', { to: 'main', group: 'tools' }).toJSON().bars!
      .main!.start![2];
    expect(tools).toEqual({ id: 'tools', items: ['tool:pointer', 'tool:pan', 'tool:ink'] });
  });

  it('starts a named group when the group id is new', () => {
    const end = createLayout(base)
      .add('acme:send', { to: 'main', section: 'end', group: 'acme' })
      .toJSON().bars!.main!.end!;
    expect(end.at(-1)).toEqual({ id: 'acme', items: ['acme:send'] });
  });

  it('puts an item before or after another, in that item’s group', () => {
    const layout = createLayout(base);
    expect(
      layout.add('document:print', { to: 'main', after: 'panel:search' }).toJSON().bars!.main!
        .end![0],
    ).toEqual({ id: 'panels', items: ['panel:search', 'document:print', 'panel:comments'] });
    expect(
      layout.add('tool:ink', { to: 'main', before: 'tool:pointer' }).toJSON().bars!.main!.start![2],
    ).toEqual({ id: 'tools', items: ['tool:ink', 'tool:pointer', 'tool:pan'] });
  });

  it('turns a lone item into a group when something goes next to it', () => {
    const center = createLayout(base)
      .add('history:redo', { to: 'annotate', after: 'history:undo' })
      .toJSON().bars!.annotate!.center!;
    expect(center).toEqual([
      ['tool:highlight', 'tool:underline'],
      ['history:undo', 'history:redo'],
    ]);
  });

  it('finds your own component by its id', () => {
    const zoom = createLayout(base).add('zoom:in', { to: 'main', after: 'zoom' }).toJSON().bars!
      .main!.start![1];
    expect(zoom).toEqual({
      id: 'zoom',
      items: [{ custom: 'zoom', command: 'menu:zoom' }, 'zoom:in'],
    });
  });

  it('still adds the item when the item to go next to is missing, and warns', () => {
    const layout = createLayout(base).add('document:print', {
      to: 'main',
      after: 'panel:serch',
    });
    expect(layout.toJSON().bars!.main!.end!.at(-1)).toEqual(['document:print']);
    expect(layoutWarningsOf(layout)).toEqual([
      'add: "panel:serch" is not in "main" (did you mean "panel:search"?)',
    ]);
  });

  it('does not put an item in a group twice', () => {
    const layout = createLayout(base).add('tool:pan', { to: 'main', group: 'tools' });
    expect(layout.toJSON()).toBe(base);
    expect(layoutWarningsOf(layout)).toEqual([
      'add: "tool:pan" is already in that group of "main"',
    ]);
  });

  it('adds to a menu: in a new section at the end, or next to an item', () => {
    const layout = createLayout(base);
    expect(layout.add('acme:export', { to: 'document' }).toJSON().menus!.document).toEqual([
      ['document:download', 'document:print'],
      ['view:fullscreen'],
      ['acme:export'],
    ]);
    expect(
      layout.add('acme:export', { to: 'document', after: 'document:print' }).toJSON().menus!
        .document,
    ).toEqual([['document:download', 'document:print', 'acme:export'], ['view:fullscreen']]);
    expect(
      layout.add('view:scroll-horizontal', { to: 'view', after: 'view:scroll-vertical' }).toJSON()
        .menus!.view,
    ).toEqual([
      {
        titleKey: 'commands.scroll.group',
        items: ['view:scroll-vertical', 'view:scroll-horizontal'],
      },
    ]);
  });

  it('adds a command object to a menu by its command, and refuses your own component', () => {
    const layout = createLayout(base)
      .add({ command: 'acme:export', importance: 5 }, { to: 'document' })
      .add({ custom: 'versions' }, { to: 'document' });
    expect(layout.toJSON().menus!.document.at(-1)).toEqual(['acme:export']);
    expect(layoutWarningsOf(layout)).toEqual([
      'add: "document" is a menu, which holds commands, not your own components',
    ]);
  });

  it('prefers a bar to a menu with the same id', () => {
    const layout = createLayout(base)
      .addBar('document', { place: 'bottom' })
      .add('acme:x', { to: 'document' });
    expect(layout.toJSON().bars!.document!.end).toEqual([['acme:x']]);
    expect(layout.toJSON().menus!.document).toBe(base.menus!.document);
  });

  it('warns about an unknown bar or menu, and about a missing target', () => {
    const layout = createLayout(base)
      .add('x:y', { to: 'documnet' })
      .add('x:y', undefined as never);
    expect(layout.toJSON()).toBe(base);
    expect(layoutWarningsOf(layout)).toEqual([
      'add: no bar or menu "documnet" (did you mean "document"?)',
      'add: "x:y" needs a bar or menu to go to ({ to })',
    ]);
  });

  it('warns about something that is not an item', () => {
    const layout = createLayout(base).add({ nope: true } as never, { to: 'main' });
    expect(layout.toJSON()).toBe(base);
    expect(layoutWarningsOf(layout)).toEqual(['add: {"nope":true} is not an item']);
  });
});

describe('remove', () => {
  it('takes items out of one bar only', () => {
    const next = createLayout(base)
      .addBar('rail', { place: 'start', start: [['tool:pan']] })
      .remove(['tool:pan', 'panel:comments'], { from: 'main' })
      .toJSON();
    expect(next.bars!.main!.start![2]).toEqual({ id: 'tools', items: ['tool:pointer'] });
    expect(next.bars!.main!.end).toEqual([{ id: 'panels', items: ['panel:search'] }]);
    expect(next.bars!.rail!.start).toEqual([['tool:pan']]);
  });

  it('keeps the modes group, whose tabs are derived, when it edits the bar around it', () => {
    const removed = createLayout(base).remove('tool:pan', { from: 'main' }).toJSON();
    expect(removed.bars!.main!.center).toEqual([{ id: 'modes', items: [], collapse: 'select' }]);
    const replaced = createLayout(base).replace('tool:pan', 'acme:pan').toJSON();
    expect(replaced.bars!.main!.center).toEqual([{ id: 'modes', items: [], collapse: 'select' }]);
    const panelGone = createLayout(base).removePanel('comments').toJSON();
    expect(panelGone.bars!.main!.center).toEqual([{ id: 'modes', items: [], collapse: 'select' }]);
  });

  it('drops a group with nothing left, and a section with nothing left', () => {
    const next = createLayout(base)
      .remove(['panel:search', 'panel:comments'], { from: 'main' })
      .remove('selection:copy', { from: 'selection' })
      .toJSON();
    expect(next.bars!.main!.end).toBeUndefined();
    expect(next.bars!.selection).toEqual({ place: { at: 'selection' } });
  });

  it('removes your own component by its id, and a lone item', () => {
    const next = createLayout(base)
      .remove('zoom', { from: 'main' })
      .remove('history:undo', { from: 'annotate' })
      .toJSON();
    expect(next.bars!.main!.start!.map((entry) => (entry as { id: string }).id)).toEqual([
      'document',
      'tools',
    ]);
    expect(next.bars!.annotate!.center).toEqual([['tool:highlight', 'tool:underline']]);
  });

  it('takes items out of a menu, dropping an emptied section and keeping titles', () => {
    const next = createLayout(base)
      .remove('view:fullscreen', { from: 'document' })
      .addMenu('view', [
        { title: 'Scroll', items: ['view:scroll-vertical', 'view:scroll-horizontal'] },
      ])
      .remove('view:scroll-vertical', { from: 'view' })
      .toJSON();
    expect(next.menus!.document).toEqual([['document:download', 'document:print']]);
    expect(next.menus!.view).toEqual([{ title: 'Scroll', items: ['view:scroll-horizontal'] }]);
  });

  it('warns for each id that is not in that place, with the closest one', () => {
    const layout = createLayout(base).remove(['tool:pann', 'tool:pointer'], { from: 'main' });
    expect(layout.toJSON().bars!.main!.start![2]).toEqual({ id: 'tools', items: ['tool:pan'] });
    expect(layoutWarningsOf(layout)).toEqual([
      'remove: "tool:pann" is not in "main" (did you mean "tool:pan"?)',
    ]);
  });

  it('always names one place: without one it changes nothing and says to turn it off instead', () => {
    const layout = createLayout(base).remove('tool:pan', undefined as never);
    expect(layout.toJSON()).toBe(base);
    expect(layoutWarningsOf(layout)[0]).toMatch(/needs a bar or menu.*disable/);
  });
});

describe('replace', () => {
  it('puts another item in its place in every bar and menu', () => {
    const next = createLayout(base)
      .addBar('rail', { place: 'start', start: [['document:print', 'tool:pan']] })
      .replace('document:print', 'acme:print')
      .toJSON();
    expect(next.bars!.rail!.start).toEqual([['acme:print', 'tool:pan']]);
    expect(next.menus!.document[0]).toEqual(['document:download', 'acme:print']);
  });

  it('takes a command object, which a menu shows by its command', () => {
    const next = createLayout(base)
      .replace('panel:comments', { command: 'acme:chat', importance: 5 })
      .replace('view:fullscreen', { command: 'acme:full' })
      .toJSON();
    expect(next.bars!.main!.end![0]).toEqual({
      id: 'panels',
      items: ['panel:search', { command: 'acme:chat', importance: 5 }],
    });
    expect(next.menus!.document[1]).toEqual(['acme:full']);
  });

  it('leaves menus alone when the replacement is your own component', () => {
    const next = createLayout(base)
      .addBar('rail', { place: 'start', start: [['document:print']] })
      .replace('document:print', { custom: 'printer' })
      .toJSON();
    expect(next.bars!.rail!.start).toEqual([[{ custom: 'printer' }]]);
    expect(next.menus!.document[0]).toEqual(['document:download', 'document:print']);
  });

  it('warns about an id that is nowhere', () => {
    const layout = createLayout(base).replace('document:downlaod', 'acme:save');
    expect(layoutWarningsOf(layout)).toEqual([
      'replace: "document:downlaod" is in no bar or menu (did you mean "document:download"?)',
    ]);
  });
});

describe('menus, panels and tabs', () => {
  it('adds a menu with titled sections', () => {
    const sections = [{ title: 'Export as', items: ['acme:word'] }, ['document:download']];
    expect(createLayout(base).addMenu('export', sections).toJSON().menus!.export).toBe(sections);
  });

  it('adds, changes and removes panels', () => {
    const layout = createLayout(base)
      .addPanel('notes', { side: 'end', title: 'Notes', icon: 'book' })
      .panel('thumbnails', { side: 'end', width: 320 })
      .panel('thumbnail', { side: 'start' });
    expect(layout.toJSON().panels).toEqual({
      comments: { side: 'end' },
      thumbnails: { side: 'end', width: 320 },
      notes: { side: 'end', title: 'Notes', icon: 'book' },
    });
    expect(layoutWarningsOf(layout)).toEqual([
      'panel: no panel "thumbnail" (did you mean "thumbnails"?)',
    ]);
  });

  it('takes a removed panel’s button out of every bar and menu', () => {
    const next = createLayout(base)
      .addMenu('extra', [['panel:comments', 'acme:x']])
      .removePanel('comments')
      .toJSON();
    expect(next.panels).toEqual({ thumbnails: { side: 'start' } });
    expect(next.bars!.main!.end).toEqual([{ id: 'panels', items: ['panel:search'] }]);
    expect(next.menus!.extra).toEqual([['acme:x']]);
  });

  it('sets when the document tabs show', () => {
    expect(createLayout(base).tabs('multiple').toJSON().tabs).toBe('multiple');
  });
});

describe('the env', () => {
  it('sizes the viewer by its own width', () => {
    expect(sizeOf(0)).toBe('compact');
    expect(sizeOf(599)).toBe('compact');
    expect(sizeOf(600)).toBe('medium');
    expect(sizeOf(1023)).toBe('medium');
    expect(sizeOf(1024)).toBe('expanded');
  });

  it('compares every field', () => {
    expect(sameLayoutEnv(env, { ...env })).toBe(true);
    expect(sameLayoutEnv(env, { ...env, width: 1281 })).toBe(false);
    expect(sameLayoutEnv(env, { ...env, touch: true })).toBe(false);
    expect(sameLayoutEnv(env, { ...env, dir: 'rtl' })).toBe(false);
  });
});

describe('resolveLayout', () => {
  const defaults = createLayout(base);

  it('gives the default without an option', () => {
    expect(resolveLayout(undefined, defaults, env)).toBe(defaults);
  });

  it('calls a function with the default and the env', () => {
    const resolved = resolveLayout(
      (layout, { size }) => (size === 'compact' ? layout.place('main', 'bottom') : layout),
      defaults,
      { ...env, size: 'compact', width: 400 },
    );
    expect(resolved.toJSON().bars!.main!.place).toBe('bottom');
  });

  it('takes a layout, plain data, or a function that returns plain data', () => {
    const data: LayoutData = { bars: { main: { place: 'top' } } };
    expect(resolveLayout(defaults, createLayout(), env)).toBe(defaults);
    expect(resolveLayout(data, defaults, env).toJSON()).toBe(data);
    expect(resolveLayout(() => data, defaults, env).toJSON()).toBe(data);
  });

  it('falls back to the default, with a warning, when the function throws or returns nothing', () => {
    const threw = resolveLayout(
      () => {
        throw new Error('boom');
      },
      defaults,
      env,
    );
    expect(threw.toJSON()).toBe(base);
    expect(layoutWarningsOf(threw)).toEqual([
      'the layout function threw (boom); showing the default layout',
    ]);
    const forgot = resolveLayout((() => undefined) as never, defaults, env);
    expect(forgot.toJSON()).toBe(base);
    expect(layoutWarningsOf(forgot)[0]).toMatch(/returned nothing/);
  });
});

describe('edits of data of the wrong shape', () => {
  it('skip what is not an item, a section or a menu instead of throwing', () => {
    const broken = createLayout({
      bars: { main: { place: 'top', start: [[42, 'tool:pan']], end: 'tool:pan' } },
      menus: { document: 'document:print' },
    } as unknown as LayoutData);
    const edited = broken
      .remove('tool:pan', { from: 'main' })
      .add('tool:ink', { to: 'main', after: 'tool:pan' })
      .replace('tool:ink', 'tool:note')
      .add('document:download', { to: 'document', after: 'document:print' })
      .remove('document:download', { from: 'document' });
    expect(edited.toJSON().bars!.main!.end).toEqual([['tool:note']]);
    expect(edited.toJSON().menus!.document).toEqual([]);
  });
});
