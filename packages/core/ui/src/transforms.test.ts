import { describe, expect, it } from 'vitest';
import { defineChrome, group, item, custom, normalizeBar, type ChromeSchema } from './schema';
import { addItem, removeItems, replaceItem } from './transforms';

const base: ChromeSchema = defineChrome({
  bars: {
    main: {
      id: 'main',
      sections: {
        start: [group('zoom', [custom('zoom-controls', { terminal: 'zoom:menu' })])],
        center: [group('modes', { role: 'tabs' }, [item('mode:view', { variants: ['label'] })])],
        end: [group('panels', ['panel:search', 'panel:comment'])],
      },
    },
  },
  modeBars: {
    'mode:annotate': {
      id: 'annotate',
      sections: { center: [group('markup', ['annotation:add-highlight'])] },
    },
  },
  menus: {
    document: { id: 'document', sections: [{ items: ['document:download', 'document:print'] }] },
  },
  strips: {
    annotation: {
      id: 'annotation-strip',
      sections: { center: [group('actions', ['annotation:delete'])] },
    },
  },
});

describe('addItem', () => {
  it('appends to an existing group', () => {
    const next = addItem(base, { bar: 'main', section: 'end', group: 'panels', item: 'acme:send' });
    expect(next.bars.main.sections.end![0].items).toEqual([
      'panel:search',
      'panel:comment',
      'acme:send',
    ]);
    // untouched parts keep identity — transforms are surgical
    expect(next.bars.main.sections.start).toBe(base.bars.main.sections.start);
  });

  it('inserts at a position', () => {
    const next = addItem(base, {
      bar: 'main',
      section: 'end',
      group: 'panels',
      item: 'acme:send',
      at: 0,
    });
    expect(next.bars.main.sections.end![0].items[0]).toBe('acme:send');
  });

  it('creates an unknown group at the end of the section', () => {
    const next = addItem(base, { bar: 'main', section: 'end', group: 'acme', item: 'acme:send' });
    const groups = next.bars.main.sections.end!;
    expect(groups.map((g) => g.id)).toEqual(['panels', 'acme']);
    expect(() => normalizeBar(next.bars.main)).not.toThrow();
  });

  it('addresses mode bars by bar id and by surface key', () => {
    for (const bar of ['annotate', 'mode:annotate']) {
      const next = addItem(base, { bar, section: 'center', group: 'markup', item: 'acme:stamp' });
      expect(next.modeBars!['mode:annotate'].sections.center![0].items).toContain('acme:stamp');
    }
  });

  it('rejects unknown bars, and groups addressed in the wrong section', () => {
    expect(() =>
      addItem(base, { bar: 'nope', section: 'end', group: 'panels', item: 'x' }),
    ).toThrow(/no bar/);
    expect(() =>
      addItem(base, { bar: 'main', section: 'start', group: 'panels', item: 'x' }),
    ).toThrow(/lives in section/);
  });
});

describe('removeItems', () => {
  it('purges a command from bars, menus, and strips; drops emptied groups', () => {
    const next = removeItems(base, ['panel:comment', 'document:print', 'annotation:delete']);
    expect(next.bars.main.sections.end![0].items).toEqual(['panel:search']);
    expect(next.menus!.document.sections[0].items).toEqual(['document:download']);
    // strip's only group emptied → group gone, section gone, bar remains
    expect(next.strips!.annotation.sections.center).toBeUndefined();
  });

  it('removes custom items by slot name', () => {
    const next = removeItems(base, ['zoom-controls']);
    expect(next.bars.main.sections.start).toBeUndefined();
  });
});

describe('replaceItem', () => {
  it('swaps in place across bars and menus', () => {
    const next = replaceItem(base, 'panel:comment', { command: 'acme:chat', importance: 5 });
    expect(next.bars.main.sections.end![0].items[1]).toEqual({
      command: 'acme:chat',
      importance: 5,
    });
    const menuNext = replaceItem(base, 'document:print', 'acme:print');
    expect(menuNext.menus!.document.sections[0].items).toEqual(['document:download', 'acme:print']);
  });

  it('keeps menus untouched when the replacement is a custom item', () => {
    const next = replaceItem(base, 'document:print', custom('x', { terminal: 'y' }));
    expect(next.menus).toBe(base.menus);
  });
});
