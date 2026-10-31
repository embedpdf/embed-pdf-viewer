/**
 * The layout's panels as commands: every panel gets `panel:<id>`, titled and
 * drawn as the panel says, the built-in ones turned off with their feature,
 * and search brings Find; the default layout lists every built-in panel on its side, with a title in
 * every language the viewer ships.
 */
import { createLayout } from '@embedpdf/core-ui';
import { AttachmentToken } from '@embedpdf/plugin-attachment';
import { CommandsToken, type CommandDef } from '@embedpdf/plugin-commands';
import { OutlineToken } from '@embedpdf/plugin-outline';
import { RenderToken } from '@embedpdf/plugin-render';
import { describe, expect, it } from 'vitest';

import { DEFAULT_LAYOUT } from '../../../chrome/src/config/chrome';
import { panelCommandsFor, panelsOnSide, samePanels } from '../../../chrome/src/config/panels';
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
  it('lists every built-in panel, the first three at the start', () => {
    const panels = DEFAULT_LAYOUT.panels!;
    expect(Object.keys(panels)).toEqual(BUILT_IN);
    expect(panelsOnSide(DEFAULT_LAYOUT, 'start')).toEqual(['thumbnails', 'outline', 'attachments']);
    for (const id of BUILT_IN) expect(panels[id]!.icon, id).toBeTruthy();
  });

  it('titles every built-in panel in every language the viewer ships', () => {
    for (const id of BUILT_IN) {
      const key = DEFAULT_LAYOUT.panels![id]!.titleKey!;
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
