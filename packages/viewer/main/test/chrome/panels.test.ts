/**
 * The layout's panels as commands: every panel gets `panel:<id>`, titled and
 * drawn as the panel says, a built-in one bringing its own title and icon to
 * any layout, the built-in ones turned off with their feature, a panel that
 * can't close getting a button that only opens it, and search brings Find;
 * the default layout lists every built-in panel on its side, with a title in
 * every language the viewer ships; and what a side opens by itself.
 */
import { createLayout, type LayoutData } from '@embedpdf/core-ui';
import { AttachmentToken } from '@embedpdf/plugin-attachment';
import { CommandsToken, type CommandDef } from '@embedpdf/plugin-commands';
import { OutlineToken } from '@embedpdf/plugin-outline';
import { RenderToken } from '@embedpdf/plugin-render';
import { ShellToken } from '@embedpdf/plugin-shell';
import { describe, expect, it } from 'vitest';

import { DEFAULT_LAYOUT } from '../../../chrome/src/config/chrome';
import {
  panelCommandsFor,
  panelOpeningOnSide,
  panelsOnSide,
  samePanels,
  type SidePanels,
} from '../../../chrome/src/config/panels';
import { en } from '../../../chrome/src/locales/en';
import { es } from '../../../chrome/src/locales/es';

const BUILT_IN = [
  'thumbnails',
  'outline',
  'attachments',
  'search',
  'comments',
  'style',
  'stamps',
  'signatures',
  'redaction',
  'measurement',
  'form-design',
];

const lookUp = (translations: object, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : null,
      translations,
    );

describe('panelCommandsFor', () => {
  it('gives every panel a command that opens it, labeled and drawn as the panel is', () => {
    const commands = panelCommandsFor(
      {
        notes: { side: 'end', title: 'Notes', icon: 'book' },
        review: { titleKey: 'acme.review' },
        bare: {},
      },
      () => false,
    );
    expect(commands).toEqual([
      { id: 'panel:notes', label: 'Notes', labelKey: undefined, icon: 'book', panel: 'notes' },
      {
        id: 'panel:review',
        label: undefined,
        labelKey: 'acme.review',
        icon: undefined,
        panel: 'review',
      },
      // Without a title, its button reads the panel's id.
      { id: 'panel:bare', label: 'bare', labelKey: undefined, icon: undefined, panel: 'bare' },
    ]);
  });

  it('leaves out a panel whose command is taken, so your own command wins', () => {
    const commands = panelCommandsFor(
      { notes: { title: 'Notes' }, comments: { title: 'Comments' } },
      (id) => id === 'panel:comments',
    );
    expect(commands.map((command) => command.id)).toEqual(['panel:notes']);
  });

  it('turns a built-in panel off with its feature', () => {
    const commands = panelCommandsFor(DEFAULT_LAYOUT.panels, () => false);
    const categoriesOf = (id: string) =>
      commands.find((command) => command.id === id)?.categories ?? null;
    expect(categoriesOf('panel:thumbnails')).toEqual(['thumbnails']);
    expect(categoriesOf('panel:search')).toEqual(['search']);
    expect(categoriesOf('panel:comments')).toEqual(['comments']);
    expect(categoriesOf('panel:style')).toEqual(['annotations']);
    expect(categoriesOf('panel:signatures')).toEqual(['signatures']);
    // Whether the session may search is the search plugin's to say; its button puts the
    // cursor in the field, and Ctrl/Cmd+F is Find's.
    const search = commands.find((command) => command.id === 'panel:search');
    expect(search?.requires).toBeUndefined();
    expect(search?.notAllowedKey).toBe('commands.notAllowed.doc-text-search');
    expect(search?.panel).toEqual({ id: 'search', focus: true });
    expect(search?.shortcut).toBeUndefined();
  });

  it('brings Find with a search panel: Ctrl/Cmd+F, from text fields too, with the same check', () => {
    const commands = panelCommandsFor(DEFAULT_LAYOUT.panels, () => false);
    const search = commands.find((command) => command.id === 'panel:search')!;
    const find = commands.find((command) => command.id === 'search:find');
    expect(find).toMatchObject({
      labelKey: 'commands.find',
      shortcut: 'Mod+F',
      shortcutInTextFields: true,
      categories: ['search'],
      notAllowedKey: 'commands.notAllowed.doc-text-search',
      allowed: search.allowed,
    });
    // A layout without search has no Find, and your own Find wins over the built-in one.
    expect(
      panelCommandsFor({ notes: { title: 'Notes' } }, () => false).map((command) => command.id),
    ).toEqual(['panel:notes']);
    expect(
      panelCommandsFor(DEFAULT_LAYOUT.panels, (id) => id === 'search:find').map(
        (command) => command.id,
      ),
    ).not.toContain('search:find');
  });

  it("follows a panel's own title over the built-in one", () => {
    const layout = createLayout(DEFAULT_LAYOUT).panel('thumbnails', { title: 'Pages' });
    const thumbnails = panelCommandsFor(layout.toJSON().panels, () => false).find(
      (command) => command.id === 'panel:thumbnails',
    );
    expect(thumbnails).toMatchObject({ label: 'Pages', categories: ['thumbnails'] });
    // The built-in words are gone, so nothing under them wins over the title.
    expect(thumbnails!.labelKey).toBeUndefined();
  });

  it("follows a panel's own titleKey and icon over the built-in ones", () => {
    const layout = createLayout(DEFAULT_LAYOUT).panel('comments', {
      titleKey: 'acme.reviewNotes',
      icon: 'book',
    });
    const comments = panelCommandsFor(layout.toJSON().panels, () => false).find(
      (command) => command.id === 'panel:comments',
    );
    expect(comments).toMatchObject({
      label: undefined,
      labelKey: 'acme.reviewNotes',
      icon: 'book',
      categories: ['comments'],
    });
  });

  it('gives a built-in panel its own title and icon in a whole layout of yours', () => {
    const [search] = panelCommandsFor({ search: { side: 'end' } }, () => false);
    expect(search).toMatchObject({
      id: 'panel:search',
      label: undefined,
      labelKey: 'panels.search',
      icon: 'search',
      panel: { id: 'search', focus: true },
    });
  });

  it('gives a panel that cannot close a button that opens it and leaves it open', () => {
    const [notes, comments] = panelCommandsFor(
      { notes: { title: 'Notes', closable: false }, comments: { closable: false } },
      () => false,
    );
    expect(notes!.panel).toBeUndefined();
    expect(comments).toMatchObject({ labelKey: 'panels.comments', categories: ['comments'] });

    const opened: unknown[] = [];
    let open = false;
    const shell = {
      isOpen: (id: string) => id === 'notes' && open,
      open: (id: string, options?: unknown) => {
        opened.push([id, options]);
        open = true;
      },
    };
    type Context = Parameters<NonNullable<CommandDef['run']>>[0];
    const context = {
      documentId: 'doc',
      tryGet: (token: unknown) => (token === ShellToken ? shell : null),
    } as unknown as Context;
    expect(notes!.active!(context)).toBe(false);
    void notes!.run!(context);
    void notes!.run!(context);
    expect(opened).toEqual([
      ['notes', undefined],
      ['notes', undefined],
    ]);
    expect(notes!.active!(context)).toBe(true);

    // Search's button still puts the cursor in its field.
    const [search] = panelCommandsFor({ search: { closable: false } }, () => false);
    void search!.run!({ ...context, tryGet: () => shell } as unknown as Context);
    expect(opened.at(-1)).toEqual(['search', { focus: true }]);
  });
});

describe('panelOpeningOnSide', () => {
  const panels: NonNullable<LayoutData['panels']> = {
    thumbnails: { side: 'start' },
    outline: { side: 'start', open: true },
    notes: { side: 'start', closable: false },
    attachments: { side: 'start', open: true },
  };
  const ids = ['thumbnails', 'outline', 'notes', 'attachments'];
  const side = (changes: Partial<SidePanels> = {}): SidePanels => ({
    ids,
    shown: ids,
    current: null,
    docks: () => true,
    ...changes,
  });

  it('opens the first panel that opens from the start, where it docks, once per document', () => {
    expect(panelOpeningOnSide(panels, side(), new Set())).toEqual({
      open: 'outline',
      started: ['outline', 'attachments'],
    });
    // Its turn is over: after it closes, the side opens the panel that can't close.
    expect(panelOpeningOnSide(panels, side(), new Set(['outline', 'attachments']))).toEqual({
      open: 'notes',
      started: [],
    });
  });

  it('keeps a panel that cannot close open where it docks, and only there', () => {
    const only = { notes: { side: 'start' as const, closable: false } };
    expect(panelOpeningOnSide(only, side({ ids: ['notes'] }), new Set()).open).toBe('notes');
    expect(
      panelOpeningOnSide(only, side({ ids: ['notes'], docks: () => false }), new Set()).open,
    ).toBeNull();
    // Another panel on its side has its place until it closes.
    expect(
      panelOpeningOnSide(only, side({ ids: ['notes', 'search'], current: 'search' }), new Set())
        .open,
    ).toBeNull();
  });

  it('passes the turn of a panel that opens from the start on a side already open, or where it would cover the pages', () => {
    expect(panelOpeningOnSide(panels, side({ current: 'thumbnails' }), new Set())).toEqual({
      open: null,
      started: ['outline', 'attachments'],
    });
    const phone = panelOpeningOnSide(
      { outline: { open: true } },
      side({ ids: ['outline'], docks: () => false }),
      new Set(),
    );
    expect(phone).toEqual({ open: null, started: ['outline'] });
  });

  it('waits for a panel that does not show yet, and gives it its turn once it does', () => {
    const waiting = panelOpeningOnSide(
      { outline: { open: true } },
      side({ ids: ['outline'], shown: [] }),
      new Set(),
    );
    expect(waiting).toEqual({ open: null, started: [] });
    expect(
      panelOpeningOnSide({ outline: { open: true } }, side({ ids: ['outline'] }), new Set()).open,
    ).toBe('outline');
  });
});

describe('panelsOnSide', () => {
  it("lists a side's panels in layout order, at the end unless they say start", () => {
    const data = createLayout(DEFAULT_LAYOUT)
      .panel('thumbnails', { side: 'end' })
      .addPanel('notes', { title: 'Notes' })
      .toJSON();
    expect(panelsOnSide(data, 'start')).toEqual(['outline', 'attachments']);
    expect(panelsOnSide(data, 'end')).toEqual([
      'thumbnails',
      'search',
      'comments',
      'style',
      'stamps',
      'signatures',
      'redaction',
      'measurement',
      'form-design',
      'notes',
    ]);
  });

  it('has nothing on a side after the layout removes its panels', () => {
    const data = createLayout(DEFAULT_LAYOUT)
      .removePanel('thumbnails')
      .removePanel('outline')
      .removePanel('attachments')
      .toJSON();
    expect(panelsOnSide(data, 'start')).toEqual([]);
  });
});

describe('the default layout', () => {
  const commandOf = (id: string) =>
    panelCommandsFor(DEFAULT_LAYOUT.panels, () => false).find(
      (command) => command.id === `panel:${id}`,
    )!;

  it('lists every built-in panel, the first three at the start, each with its icon', () => {
    const panels = DEFAULT_LAYOUT.panels!;
    expect(Object.keys(panels)).toEqual(BUILT_IN);
    expect(panelsOnSide(DEFAULT_LAYOUT, 'start')).toEqual(['thumbnails', 'outline', 'attachments']);
    for (const id of BUILT_IN) expect(commandOf(id).icon, id).toBeTruthy();
  });

  it('titles every built-in panel in every language the viewer ships', () => {
    for (const id of BUILT_IN) {
      const key = commandOf(id).labelKey!;
      expect(typeof lookUp(en.translations, key), `${id} in en`).toBe('string');
      expect(typeof lookUp(es.translations, key), `${id} in es`).toBe('string');
    }
  });
});

describe('samePanels', () => {
  it('is true for equal panels in another object, false once a field changes', () => {
    const panels = { notes: { side: 'end' as const, title: 'Notes' } };
    expect(samePanels(panels, { notes: { side: 'end', title: 'Notes' } })).toBe(true);
    expect(samePanels(panels, { notes: { side: 'start', title: 'Notes' } })).toBe(false);
    expect(samePanels(undefined, {})).toBe(true);
  });
});

describe('the outline and attachments panels', () => {
  type Context = Parameters<NonNullable<CommandDef['visible']>>[0];
  const visibleOf = (id: string) =>
    panelCommandsFor(DEFAULT_LAYOUT.panels, () => false).find(
      (command) => command.id === `panel:${id}`,
    )!.visible!;

  /** A session whose lists hold `entries`, that may add when `mayAdd`, with `off` features off. */
  const session = (entries: number, mayAdd: boolean, off: readonly string[] = []): Context => {
    const list = () => Array.from({ length: entries }, (_, index) => ({ id: String(index) }));
    const capabilities = new Map<unknown, unknown>([
      [OutlineToken, { list, canEdit: () => mayAdd }],
      [AttachmentToken, { list, canAdd: () => mayAdd }],
      [CommandsToken, { isCategoryDisabled: (feature: string) => off.includes(feature) }],
    ]);
    const tryGet = (token: unknown) => capabilities.get(token) ?? null;
    return { documentId: 'doc', tryGet, get: tryGet } as unknown as Context;
  };

  it('show while their lists hold entries, or the session may add some', () => {
    for (const id of ['outline', 'attachments']) {
      const visible = visibleOf(id);
      expect(visible(session(2, false))).toBe(true);
      expect(visible(session(0, true))).toBe(true);
      expect(visible(session(0, false))).toBe(false);
    }
  });

  it('hide when empty once the feature that adds is off, as read-only turns it off', () => {
    expect(visibleOf('outline')(session(0, true, ['outline.editing']))).toBe(false);
    expect(visibleOf('attachments')(session(0, true, ['attachments.adding']))).toBe(false);
    expect(visibleOf('attachments')(session(1, true, ['attachments.adding']))).toBe(true);
  });

  it('hide without their plugin', () => {
    const none = { documentId: 'doc', tryGet: () => null, get: () => null } as unknown as Context;
    expect(visibleOf('outline')(none)).toBe(false);
    expect(visibleOf('attachments')(none)).toBe(false);
  });
});

describe('the thumbnails panel', () => {
  type Context = Parameters<NonNullable<CommandDef['allowed']>>[0];
  const thumbnails = () =>
    panelCommandsFor(DEFAULT_LAYOUT.panels, () => false).find(
      (command) => command.id === 'panel:thumbnails',
    )!;
  const session = (mayHaveThumbnails: boolean): Context => {
    const render = { canRenderThumbnail: () => mayHaveThumbnails };
    const tryGet = (token: unknown) => (token === RenderToken ? render : null);
    return { documentId: 'doc', tryGet, get: tryGet } as unknown as Context;
  };

  it('is allowed only to a session that may have thumbnails, and says why not', () => {
    const command = thumbnails();
    expect(command.allowed!(session(true))).toBe(true);
    expect(command.allowed!(session(false))).toBe(false);
    expect(command.notAllowedKey).toBe('commands.notAllowed.doc-render-thumbnail');
    expect(typeof lookUp(en.translations, 'commands.notAllowed.doc-render-thumbnail')).toBe(
      'string',
    );
  });
});
