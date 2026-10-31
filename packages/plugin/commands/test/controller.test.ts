import { createCapabilityToken } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';
import { ShellToken } from '@embedpdf/plugin-shell/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  COMMANDS_DEFAULTS,
  type CommandDef,
  type CommandFamily,
  type CommandsConfig,
} from '../src/contract';
import { createCommandsController } from '../src/controller';

/** The controller over a real test context: workspace-scoped, no document, no siblings. */
function harness(config: CommandsConfig = {}) {
  const ctx = createTestContext({
    id: 'commands',
    settings: { defaults: COMMANDS_DEFAULTS, registered: config },
    doc: null,
  });
  const commands = ctx.connect(createCommandsController(ctx));
  return { ctx, commands };
}

const capabilityWith = (definition: CommandDef) => harness({ commands: [definition] }).commands;

describe('resolution carries iconAccent', () => {
  it('lands a derived accent on the resolved command', () => {
    const commands = capabilityWith({
      id: 'tool:square',
      label: 'square',
      icon: 'square',
      iconAccent: () => ({ primary: '#e5484d', secondary: '#ffffff' }),
    });
    expect(commands.resolveCommand('tool:square')?.iconAccent).toEqual({
      primary: '#e5484d',
      secondary: '#ffffff',
    });
  });

  it('resolves null and absent derivations to no accent (a plain icon)', () => {
    const none = capabilityWith({ id: 'none', label: 'none', iconAccent: () => null });
    expect(none.resolveCommand('none')?.iconAccent).toBeUndefined();
    const absent = capabilityWith({ id: 'absent', label: 'absent' });
    expect(absent.resolveCommand('absent')?.iconAccent).toBeUndefined();
  });

  it('falls back to no accent when the derivation throws, like the other derivations', () => {
    const MissingToken = createCapabilityToken<{ color: string }>('missing');
    const commands = capabilityWith({
      id: 'tool:ink',
      label: 'ink',
      iconAccent: (context) => ({ primary: context.get(MissingToken).color }),
    });
    const resolved = commands.resolveCommand('tool:ink');
    expect(resolved).not.toBeNull(); // the button still renders…
    expect(resolved?.iconAccent).toBeUndefined(); // …just untinted
  });
});

describe('registry', () => {
  it('rejects a duplicate id unless replaced, and a remover owns only its registration', () => {
    const { commands } = harness();
    const first: CommandDef = { id: 'zoom:in', label: 'first' };
    const second: CommandDef = { id: 'zoom:in', label: 'second' };
    const removeFirst = commands.registerCommand(first);
    expect(() => commands.registerCommand(second)).toThrow(
      expect.objectContaining({ code: 'conflict' }),
    );
    commands.registerCommand(second, { replace: true });
    removeFirst(); // must not remove the replacement
    expect(commands.getCommand('zoom:in')).toBe(second);
    expect(commands.resolveCommand('zoom:in')?.label).toBe('second');
  });

  it('wakes readers when a command is registered and again when it is removed', () => {
    const { ctx, commands } = harness({ commands: [{ id: 'zoom:in', label: 'in' }] });
    const listener = vi.fn();
    ctx.subscribe(listener);
    const ids = commands.listCommandIds();
    const listed = commands.listCommands();
    const shortcuts = commands.listShortcuts();

    const remove = commands.registerCommand({ id: 'zoom:out', label: 'out', shortcut: 'Mod+-' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(commands.listCommandIds()).not.toBe(ids);
    expect(commands.listCommandIds()).toEqual(['zoom:in', 'zoom:out']);
    expect(commands.listCommands()).not.toBe(listed);
    expect(commands.listCommands().map((command) => command.id)).toEqual(['zoom:in', 'zoom:out']);
    expect(commands.listShortcuts()).not.toBe(shortcuts);
    expect(commands.resolveCommand('zoom:out')?.label).toBe('out');

    remove();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(commands.listCommandIds()).toEqual(['zoom:in']);
    expect(commands.resolveCommand('zoom:out')).toBeNull();
    remove(); // a second call changes nothing and wakes no one
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps resolutions and lists reference-stable while nothing changed', () => {
    const { commands } = harness({
      commands: [
        { id: 'zoom:in', label: 'in', categories: ['zoom'] },
        { id: 'print', label: 'print', shortcut: ['Mod+P'] },
      ],
    });
    const resolved = commands.resolveCommand('zoom:in');
    const listed = commands.listCommands();
    expect(commands.resolveCommand('zoom:in')).toBe(resolved);
    expect(commands.listCommands()).toBe(listed);
    expect(commands.listCommandIds()).toBe(commands.listCommandIds());
    expect(commands.listShortcuts()).toBe(commands.listShortcuts());
    expect(commands.listShortcuts()).toEqual([{ commandId: 'print', shortcut: 'Mod+P' }]);

    commands.disableCategory('zoom');
    const hidden = commands.resolveCommand('zoom:in');
    expect(hidden).not.toBe(resolved);
    expect(hidden).toMatchObject({ enabled: false, visible: false });
    expect(commands.listCommands()).not.toBe(listed);
  });
});

describe('execution', () => {
  it('runs a command, reports it, and refuses hidden, disabled and unknown ones', async () => {
    const run = vi.fn();
    const { commands } = harness({
      commands: [
        { id: 'save', label: 'save', run },
        { id: 'locked', label: 'locked', enabled: () => false },
        { id: 'secret', label: 'secret', visible: () => false },
      ],
    });
    const executed: string[] = [];
    commands.onExecuted((event) => executed.push(`${event.commandId}:${String(event.args)}`));
    await expect(commands.execute('save', { args: 1 })).resolves.toEqual({ status: 'executed' });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ args: 1 }));
    expect(executed).toEqual(['save:1']);
    await expect(commands.execute('locked')).resolves.toEqual({
      status: 'rejected',
      reason: 'disabled',
    });
    await expect(commands.execute('secret')).resolves.toEqual({
      status: 'rejected',
      reason: 'hidden',
    });
    await expect(commands.execute('missing')).resolves.toEqual({
      status: 'rejected',
      reason: 'not-found',
    });
    expect(commands.canExecute('save')).toBe(true);
    expect(commands.canExecute('locked')).toBe(false);
  });

  it('reports a failing run and rejects with a PluginError', async () => {
    const { commands } = harness({
      commands: [
        {
          id: 'broken',
          label: 'broken',
          run: () => {
            throw new Error('boom');
          },
        },
      ],
    });
    const failures: string[] = [];
    commands.onExecutionFailed((event) => failures.push(event.error.message));
    await expect(commands.execute('broken')).rejects.toMatchObject({ capability: 'commands' });
    expect(failures).toEqual(['boom']);
  });
});

describe('what a command opens', () => {
  it('toggles its panel with its group, asking for focus when the panel says so', async () => {
    const toggle = vi.fn();
    const shell = { toggle, isOpen: () => false, isMenuOpen: () => false };
    const ctx = createTestContext({
      id: 'commands',
      settings: {
        defaults: COMMANDS_DEFAULTS,
        registered: {
          commands: [
            { id: 'panel:search', label: 'Search', panel: { id: 'search', focus: true } },
            { id: 'panel:notes', label: 'Notes', panel: { id: 'notes', exclusive: 'end' } },
            { id: 'panel:outline', label: 'Outline', panel: 'outline' },
          ],
        },
      },
      doc: null,
      capabilities: [[ShellToken, shell as never]],
    });
    const commands = ctx.connect(createCommandsController(ctx));
    await commands.execute('panel:search');
    await commands.execute('panel:notes');
    await commands.execute('panel:outline');
    expect(toggle.mock.calls).toEqual([
      ['search', { exclusive: undefined, focus: true }],
      ['notes', { exclusive: 'end', focus: undefined }],
      ['outline', { exclusive: undefined, focus: undefined }],
    ]);
  });
});

describe('category gating', () => {
  it('hides the commands of a disabled category until it is enabled again', () => {
    const { commands } = harness({
      disabledCategories: ['annotate'],
      commands: [{ id: 'highlight', label: 'highlight', categories: ['annotate'] }],
    });
    expect(commands.isCategoryDisabled('annotate')).toBe(true);
    expect(commands.resolveCommand('highlight')?.visible).toBe(false);
    commands.enableCategory('annotate');
    expect(commands.getDisabledCategories()).toEqual([]);
    expect(commands.resolveCommand('highlight')?.visible).toBe(true);
    commands.setDisabledCategories(['annotate', 'forms']);
    expect(commands.getDisabledCategories()).toEqual(['annotate', 'forms']);
  });
});

describe('turning features off', () => {
  it('turns off every feature under a disabled one, on whole dotted parts', () => {
    const { commands } = harness({
      disabledCategories: ['annotations'],
      commands: [
        { id: 'tool:highlight', label: 'Highlight', categories: ['annotations.highlight'] },
        { id: 'tool:note', label: 'Note', categories: ['annotations'] },
        { id: 'acme:extra', label: 'Extra', categories: ['annotationsExtra'] },
      ],
    });
    expect(commands.resolveCommand('tool:highlight')).toMatchObject({
      visible: false,
      enabled: false,
    });
    expect(commands.resolveCommand('tool:note')?.visible).toBe(false);
    expect(commands.resolveCommand('acme:extra')?.visible).toBe(true);
    expect(commands.isCategoryDisabled('annotations.highlight')).toBe(true);
    expect(commands.isCategoryDisabled('annotationsExtra')).toBe(false);

    // Turning off a part leaves the rest of its feature on.
    commands.setDisabledCategories(['annotations.highlight']);
    expect(commands.resolveCommand('tool:highlight')?.visible).toBe(false);
    expect(commands.resolveCommand('tool:note')?.visible).toBe(true);
    expect(commands.isCategoryDisabled('annotations')).toBe(false);
  });
});

describe('turning single commands off', () => {
  const definitions: CommandDef[] = [
    { id: 'tool:highlight', label: 'Highlight', categories: ['annotations.highlight'] },
    { id: 'tool:underline', label: 'Underline', categories: ['annotations.markup'] },
  ];

  it('hides and refuses a disabled command, and only that one', async () => {
    const run = vi.fn();
    const { commands } = harness({
      disabledCommands: ['tool:highlight'],
      commands: [{ ...definitions[0]!, run }, definitions[1]!],
    });
    expect(commands.getDisabledCommands()).toEqual(['tool:highlight']);
    expect(commands.isCommandDisabled('tool:highlight')).toBe(true);
    expect(commands.resolveCommand('tool:highlight')).toMatchObject({
      visible: false,
      enabled: false,
    });
    expect(commands.resolveCommand('tool:underline')?.visible).toBe(true);
    expect(commands.canExecute('tool:highlight')).toBe(false);
    await expect(commands.execute('tool:highlight')).resolves.toEqual({
      status: 'rejected',
      reason: 'hidden',
    });
    expect(run).not.toHaveBeenCalled();
    expect(commands.searchCommands('').map((command) => command.id)).toEqual(['tool:underline']);
  });

  it('turns commands off and on through the setting, live', () => {
    const { ctx, commands } = harness({ commands: definitions });
    const changed: string[][] = [];
    commands.onSettingsChanged((event) => changed.push([...event.changed]));
    const wake = vi.fn();
    ctx.subscribe(wake);

    commands.disableCommand('tool:underline');
    commands.disableCommand('tool:underline'); // already off: no change, no event
    expect(commands.getSettings().disabledCommands).toEqual(['tool:underline']);
    expect(commands.resolveCommand('tool:underline')?.visible).toBe(false);
    expect(wake).toHaveBeenCalled();

    commands.enableCommand('tool:underline');
    expect(commands.resolveCommand('tool:underline')?.visible).toBe(true);
    commands.setDisabledCommands(['tool:highlight', 'tool:underline']);
    expect(commands.getDisabledCommands()).toEqual(['tool:highlight', 'tool:underline']);
    expect(changed).toEqual([['disabledCommands'], ['disabledCommands'], ['disabledCommands']]);
  });

  it('says a command is disabled while one of its features is, whatever its own entry', () => {
    const { commands } = harness({ disabledCategories: ['annotations'], commands: definitions });
    expect(commands.isCommandDisabled('tool:highlight')).toBe(true);
    commands.enableCommand('tool:highlight'); // not in the list: nothing to turn on
    expect(commands.isCommandDisabled('tool:highlight')).toBe(true);
    expect(commands.isCommandDisabled('acme:unknown')).toBe(false);
  });
});

describe('locked settings', () => {
  /** The controller with an i18n stand-in that knows `strings`. */
  function harnessWith(config: CommandsConfig, strings: Record<string, string> = {}) {
    const i18n = {
      t: (key: string, options?: { fallback?: string; params?: Record<string, string> }) => {
        const text = strings[key] ?? options?.fallback ?? key;
        return text.replace(/\{(\w+)\}/g, (slot, name) => options?.params?.[name] ?? slot);
      },
    };
    const ctx = createTestContext({
      id: 'commands',
      settings: { defaults: COMMANDS_DEFAULTS, registered: config },
      doc: null,
      capabilities: [[I18nToken, i18n]],
    });
    return ctx.connect(createCommandsController(ctx));
  }

  // A spread setting the test holds or lets go, as the Stage's getLock() would answer.
  let held: { by: string; reasonKey?: string } | null = null;
  let spread = 'none';
  const choice = (id: string, value: string): CommandDef => ({
    id,
    label: id === 'view:single-page' ? 'Single page' : 'Two pages',
    run: () => {
      spread = value;
    },
    active: () => spread === value,
    locked: () => held,
  });
  const single = choice('view:single-page', 'none');
  const two = choice('view:two-pages', 'odd');

  it('shows a command disabled while a lock holds its setting, and still active for its value', async () => {
    held = { by: 'protected-display', reasonKey: 'protectedDisplay.onePageAtATime' };
    spread = 'none';
    const commands = harnessWith(
      { commands: [single, two] },
      {
        'protectedDisplay.onePageAtATime': 'Protected pages show one at a time',
      },
    );
    expect(commands.resolveCommand('view:single-page')).toMatchObject({
      visible: true,
      enabled: false,
      active: true,
      disabledReason: 'Protected pages show one at a time',
    });
    expect(commands.resolveCommand('view:two-pages')).toMatchObject({
      visible: true,
      enabled: false,
      active: false,
    });
    expect(commands.getRefusal('view:two-pages')).toEqual({
      reason: 'locked',
      message: 'Protected pages show one at a time',
    });
    await expect(commands.execute('view:two-pages')).resolves.toEqual({
      status: 'rejected',
      reason: 'disabled',
    });
    expect(spread).toBe('none');
  });

  it('says the general sentence without a reason of its own, and runs again once it goes', async () => {
    held = { by: 'kiosk' };
    spread = 'none';
    const commands = harnessWith({ commands: [single, two] });
    expect(commands.resolveCommand('view:two-pages')?.disabledReason).toBe(
      "Two pages can't be changed in this document",
    );
    held = null;
    expect(commands.getRefusal('view:two-pages')).toBeNull();
    await expect(commands.execute('view:two-pages')).resolves.toMatchObject({ status: 'executed' });
    expect(spread).toBe('odd');
  });

  it("shows disabled even under notAllowed: 'hide', and turned off stays hidden", () => {
    held = { by: 'kiosk' };
    const hidden = harnessWith({ commands: [single], notAllowed: 'hide' });
    expect(hidden.resolveCommand('view:single-page')).toMatchObject({
      visible: true,
      enabled: false,
    });
    const off = harnessWith({ commands: [single], disabledCommands: ['view:single-page'] });
    expect(off.resolveCommand('view:single-page')).toMatchObject({ visible: false });
    expect(off.getRefusal('view:single-page')?.reason).toBe('turned-off');
    held = null;
  });

  it('counts a locked check that throws as unlocked', () => {
    const commands = harnessWith({
      commands: [
        {
          id: 'view:odd',
          label: 'Odd',
          run: () => {},
          locked: () => {
            throw new Error('no stage');
          },
        },
      ],
    });
    expect(commands.resolveCommand('view:odd')).toMatchObject({ enabled: true });
  });
});

describe('permissions', () => {
  /** A session that holds every permission but the ones listed, and may not create annotations. */
  const securityWithout = (...missing: string[]) => ({
    allows: (permission: string) => !missing.includes(permission),
    allowsAnnotation: () => false,
  });

  /** The controller over a test context with an open document and an i18n stand-in. */
  function harnessWith(
    config: CommandsConfig,
    security: ReturnType<typeof securityWithout> | null,
    strings: Record<string, string> = {},
  ) {
    const i18n = {
      t: (key: string, options?: { fallback?: string; params?: Record<string, string> }) => {
        const text = strings[key] ?? options?.fallback ?? key;
        return text.replace(/\{(\w+)\}/g, (slot, name) => options?.params?.[name] ?? slot);
      },
    };
    const ctx = createTestContext({
      id: 'commands',
      settings: { defaults: COMMANDS_DEFAULTS, registered: config },
      doc: security ? { security: security as never } : null,
      capabilities: [[I18nToken, i18n]],
    });
    return ctx.connect(createCommandsController(ctx));
  }

  const print: CommandDef = { id: 'document:print', label: 'Print', requires: ['doc.print'] };
  const note: CommandDef = { id: 'tool:note', label: 'Note', requires: ['annotations:create'] };

  it('hides a command whose permission the scope leaves out, and refuses it', async () => {
    const commands = harnessWith({ commands: [print, note] }, securityWithout('doc.print'));
    expect(commands.resolveCommand('document:print')).toMatchObject({
      visible: false,
      enabled: false,
    });
    expect(commands.resolveCommand('document:print')?.disabledReason).toBeUndefined();
    // `annotations:create` is asked the way the annotation plugin asks it.
    expect(commands.resolveCommand('tool:note')?.visible).toBe(false);
    await expect(commands.execute('document:print')).resolves.toEqual({
      status: 'rejected',
      reason: 'hidden',
    });
  });

  it("shows it disabled with the reason under notAllowed: 'disable'", async () => {
    const commands = harnessWith(
      { commands: [print, note], notAllowed: 'disable' },
      securityWithout('doc.print'),
      { 'commands.notAllowed.doc-print': "Printing isn't allowed" },
    );
    expect(commands.resolveCommand('document:print')).toMatchObject({
      visible: true,
      enabled: false,
      disabledReason: "Printing isn't allowed",
    });
    // No sentence of its own: the general one, with the label.
    expect(commands.resolveCommand('tool:note')?.disabledReason).toBe("Note isn't allowed");
    await expect(commands.execute('document:print')).resolves.toEqual({
      status: 'rejected',
      reason: 'disabled',
    });
  });

  it('keeps a turned-off command hidden, whatever notAllowed says', () => {
    const commands = harnessWith(
      { commands: [print], notAllowed: 'disable', disabledCommands: ['document:print'] },
      securityWithout('doc.print'),
    );
    expect(commands.resolveCommand('document:print')).toMatchObject({ visible: false });
    expect(commands.resolveCommand('document:print')?.disabledReason).toBeUndefined();
  });

  it('shows a command when the scope allows it, and when no document is open', () => {
    expect(
      harnessWith({ commands: [print] }, securityWithout()).resolveCommand('document:print'),
    ).toMatchObject({ visible: true, enabled: true });
    expect(harnessWith({ commands: [print] }, null).resolveCommand('document:print')).toMatchObject(
      { visible: true, enabled: true },
    );
  });

  it('reports why a shortcut is refused, and lets one that only cannot run now through', () => {
    const stroke = (key: string) => ({
      key,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    });
    const commands = harnessWith(
      {
        commands: [
          { ...print, shortcut: 'Mod+P' },
          { id: 'zoom:in', label: 'Zoom in', shortcut: 'Mod+=', enabled: () => false },
          { id: 'acme:save', label: 'Save', shortcut: 'Mod+S', categories: ['acme.saving'] },
          { id: 'acme:send', label: 'Send', shortcut: 'Mod+E', categories: ['acme'] },
          { id: 'acme:mail', label: 'Mail', shortcut: 'Mod+E' },
        ],
        disabledCategories: ['acme'],
      },
      securityWithout('doc.print'),
      { 'commands.notAllowed.doc-print': "Printing isn't allowed" },
    );
    const options = { isMac: false };
    expect(commands.matchStroke(stroke('p'), options)).toEqual({
      commandId: 'document:print',
      refusal: { reason: 'not-allowed', message: "Printing isn't allowed" },
    });
    expect(commands.matchStroke(stroke('s'), options)).toEqual({
      commandId: 'acme:save',
      refusal: { reason: 'turned-off', message: "Save isn't available" },
    });
    expect(commands.matchStroke(stroke('='), options)).toEqual({
      commandId: 'zoom:in',
      refusal: null,
    });
    // Of two commands with the same keys, the one that isn't refused wins.
    expect(commands.matchStroke(stroke('e'), options)).toEqual({
      commandId: 'acme:mail',
      refusal: null,
    });
    expect(commands.matchStroke(stroke('k'), options)).toBeNull();
  });

  it('matches a key typed in a text field only for a command that runs from text fields', () => {
    const stroke = (key: string) => ({
      key,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    });
    const commands = harnessWith(
      {
        commands: [
          { id: 'search:find', label: 'Find', shortcut: 'Mod+F', shortcutInTextFields: true },
          { id: 'document:download', label: 'Download', shortcut: 'Mod+S' },
        ],
      },
      securityWithout(),
    );
    const inTextField = { isMac: false, inTextField: true };
    expect(commands.matchStroke(stroke('f'), inTextField)).toEqual({
      commandId: 'search:find',
      refusal: null,
    });
    expect(commands.matchStroke(stroke('s'), inTextField)).toBeNull();
    expect(commands.matchStroke(stroke('s'), { isMac: false })).toEqual({
      commandId: 'document:download',
      refusal: null,
    });
  });

  it('refuses a command its allowed check says no to, with the sentence its key names', async () => {
    let canPrint = false;
    const checked: CommandDef = {
      id: 'document:print',
      label: 'Print',
      allowed: () => canPrint,
      notAllowedKey: 'commands.notAllowed.doc-print',
    };
    const thrown: CommandDef = {
      id: 'acme:thrown',
      label: 'Thrown',
      allowed: () => {
        throw new Error('no plugin');
      },
    };
    const general: CommandDef = { id: 'acme:general', label: 'Send', allowed: () => false };
    const strings = { 'commands.notAllowed.doc-print': "Printing isn't allowed" };
    const hidden = harnessWith(
      { commands: [checked, thrown, general] },
      securityWithout(),
      strings,
    );
    expect(hidden.resolveCommand('document:print')).toMatchObject({
      visible: false,
      enabled: false,
    });
    expect(hidden.resolveCommand('acme:thrown')).toMatchObject({ visible: true, enabled: true });
    expect(hidden.getRefusal('document:print')).toEqual({
      reason: 'not-allowed',
      message: "Printing isn't allowed",
    });
    expect(hidden.getRefusal('acme:general')).toEqual({
      reason: 'not-allowed',
      message: "Send isn't allowed",
    });
    expect(hidden.getRefusal('acme:thrown')).toBeNull();
    expect(hidden.getRefusal('acme:unknown')).toBeNull();
    await expect(hidden.execute('document:print')).resolves.toEqual({
      status: 'rejected',
      reason: 'hidden',
    });

    const disabled = harnessWith(
      { commands: [checked], notAllowed: 'disable' },
      securityWithout(),
      strings,
    );
    expect(disabled.resolveCommand('document:print')).toMatchObject({
      visible: true,
      enabled: false,
      disabledReason: "Printing isn't allowed",
    });
    canPrint = true;
    expect(disabled.getRefusal('document:print')).toBeNull();
    // With no document there is no session to ask.
    canPrint = false;
    expect(harnessWith({ commands: [checked] }, null).getRefusal('document:print')).toBeNull();
  });

  it('says a turned-off command is turned off, before whether it is allowed', () => {
    const commands = harnessWith(
      { commands: [print], disabledCommands: ['document:print'] },
      securityWithout('doc.print'),
    );
    expect(commands.getRefusal('document:print')).toEqual({
      reason: 'turned-off',
      message: "Print isn't available",
    });
  });

  it('lets a key through when its refused command would not show: Delete with nothing selected', () => {
    let selected = false;
    const commands = harnessWith(
      {
        commands: [
          {
            id: 'annotation:delete',
            label: 'Delete',
            shortcut: 'Delete',
            categories: ['annotations'],
            visible: () => selected,
          },
        ],
        disabledCategories: ['annotations'],
      },
      securityWithout(),
    );
    const press = { key: 'Delete', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    expect(commands.matchStroke(press, { isMac: false })).toBeNull();
    selected = true;
    expect(commands.matchStroke(press, { isMac: false })).toEqual({
      commandId: 'annotation:delete',
      refusal: { reason: 'turned-off', message: "Delete isn't available" },
    });
  });
});

describe('settings', () => {
  it('takes its commands and categories from the settings, live', () => {
    const { ctx, commands } = harness({ commands: [{ id: 'zoom:in', label: 'In' }] });
    const changed: string[][] = [];
    commands.onSettingsChanged((event) => changed.push([...event.changed]));
    const wake = vi.fn();
    ctx.subscribe(wake);

    commands.updateSettings({
      commands: [
        { id: 'zoom:in', label: 'In' },
        { id: 'zoom:out', label: 'Out', shortcut: 'Mod+-', categories: ['zoom'] },
      ],
    });
    expect(commands.listCommandIds()).toEqual(['zoom:in', 'zoom:out']);
    expect(commands.listShortcuts()).toEqual([{ commandId: 'zoom:out', shortcut: 'Mod+-' }]);
    expect(wake).toHaveBeenCalled();

    commands.disableCategory('zoom');
    expect(commands.getSettings().disabledCategories).toEqual(['zoom']);
    expect(commands.resolveCommand('zoom:out')).toMatchObject({ enabled: false, visible: false });
    commands.disableCategory('zoom'); // already off: no change, no event
    expect(changed).toEqual([['commands'], ['disabledCategories']]);

    commands.resetSettings();
    expect(commands.listCommandIds()).toEqual(['zoom:in']);
    expect(commands.getDisabledCategories()).toEqual([]);
  });

  it('lets a later definition replace an earlier one with the same id', () => {
    const { commands } = harness({
      commands: [
        { id: 'zoom:in', label: 'Zoom in' },
        { id: 'zoom:out', label: 'Zoom out' },
        { id: 'zoom:in', label: 'Closer' },
      ],
    });
    expect(commands.listCommands().map((command) => command.label)).toEqual(['Closer', 'Zoom out']);
  });
});

describe('labels', () => {
  /** An i18n stand-in that knows the keys it's given, in one language. */
  const i18nWith = (strings: Record<string, string>) => ({
    t: (key: string, options?: { fallbackKey?: string; fallback?: string }) =>
      strings[key] ??
      (options?.fallbackKey === undefined ? undefined : strings[options.fallbackKey]) ??
      options?.fallback ??
      key,
  });

  it('shows the string under the id, then the translated label, then the plain label, then the id', async () => {
    const { createKernel, definePlugin } = await import('@embedpdf/core');
    const { I18nToken } = await import('@embedpdf/plugin-i18n/contract');
    type I18n = import('@embedpdf/plugin-i18n/contract').I18nCapability;
    const { commandsPlugin } = await import('../src/commands.plugin');
    const { CommandsToken } = await import('../src/token');
    const i18n = definePlugin({
      id: 'i18n',
      token: I18nToken,
      create: () => ({
        api: i18nWith({
          'commands.save': 'Opslaan',
          'review:reject': 'Afwijzen',
          'acme:send': 'Versturen',
        }) as unknown as I18n,
      }),
    });
    const kernel = createKernel({
      engine: {} as never,
      plugins: [
        i18n,
        commandsPlugin({
          commands: [
            { id: 'save', labelKey: 'commands.save', label: 'Save' },
            { id: 'open', labelKey: 'commands.open', label: 'Open' },
            { id: 'close', labelKey: 'commands.close' },
            { id: 'review:approve' },
            // The string under the id wins over the label's key, for this command only.
            { id: 'review:reject', labelKey: 'commands.save', label: 'Reject' },
            { id: 'acme:send', label: 'Send' },
          ],
        }),
      ],
    });
    await kernel.start();
    const labels = kernel
      .capability(CommandsToken)
      .listCommands()
      .map((command) => command.label);
    expect(labels).toEqual(['Opslaan', 'Open', 'close', 'review:approve', 'Afwijzen', 'Versturen']);
    await kernel.destroy();
  });
});

describe('families', () => {
  /** `color:<name>` for each color the test lists. */
  function colorFamily(colors: { current: readonly string[] }): CommandFamily {
    return {
      prefix: 'color:',
      names: () => colors.current,
      command: (name) => ({ label: `Color ${name}`, run: vi.fn() }),
    };
  }

  it('lists one command per name, after the defined ones, and a defined id wins', () => {
    const colors = { current: ['red', 'blue'] as readonly string[] };
    const { commands } = harness({
      commands: [colorFamily(colors), { id: 'color:red', label: 'Rood' }],
    });
    expect(commands.listCommandIds()).toEqual(['color:red', 'color:blue']);
    expect(commands.listCommands().map((command) => command.label)).toEqual(['Rood', 'Color blue']);
    expect(commands.getCommand('color:blue')).toMatchObject({ id: 'color:blue' });
    expect(commands.getCommand('color:blue')).toBe(commands.getCommand('color:blue'));
    expect(commands.hasCommand('color:green')).toBe(true); // any name resolves; listing follows names()
    expect(commands.hasCommand('colour:green')).toBe(false);
    expect(commands.searchCommands('blue').map((command) => command.id)).toEqual(['color:blue']);

    colors.current = ['blue', 'green'];
    expect(commands.listCommandIds()).toEqual(['color:red', 'color:blue', 'color:green']);
  });

  it('runs a family command with its name', async () => {
    const run = vi.fn();
    const family: CommandFamily = {
      prefix: 'tool:',
      names: () => ['ink'],
      command: (name) => ({ label: name, run: () => run(name) }),
    };
    const { commands } = harness({ commands: [family] });
    await expect(commands.execute('tool:ink')).resolves.toEqual({ status: 'executed' });
    expect(run).toHaveBeenCalledWith('ink');
  });
});

describe('cancelling', () => {
  it('rejects when the signal fires, hands the signal to run, and fires no event', async () => {
    let seen: AbortSignal | undefined;
    const { commands } = harness({
      commands: [
        {
          id: 'slow',
          label: 'Slow',
          run: (context) => {
            seen = context.signal;
            return new Promise(() => {});
          },
        },
      ],
    });
    const events = vi.fn();
    commands.onExecuted(events);
    commands.onExecutionFailed(events);
    const controller = new AbortController();
    const running = commands.execute('slow', { signal: controller.signal });
    controller.abort();
    await expect(running).rejects.toMatchObject({ code: 'operation-cancelled' });
    expect(seen).toBe(controller.signal);
    expect(events).not.toHaveBeenCalled();
    await expect(commands.execute('slow', { signal: controller.signal })).rejects.toMatchObject({
      code: 'operation-cancelled',
    });
  });
});

describe('through the kernel', () => {
  it('resolves capabilities the command definitions use, though the plugin cannot declare them', async () => {
    const { createKernel, definePlugin } = await import('@embedpdf/core');
    const { commandsPlugin } = await import('../src/commands.plugin');
    const { CommandsToken } = await import('../src/token');
    const toggleToken = createCapabilityToken<{ isOn(): boolean }>('toggle');
    const toggle = definePlugin({
      id: 'toggle',
      token: toggleToken,
      create: () => ({ api: { isOn: () => true } }),
    });
    const kernel = createKernel({
      engine: {} as never,
      plugins: [
        toggle,
        commandsPlugin({
          commands: [
            {
              id: 'toggle:check',
              label: 'check',
              enabled: (commandContext) => commandContext.tryGet(toggleToken)?.isOn() ?? false,
            },
          ],
        }),
      ],
    });
    await kernel.start();
    expect(kernel.capability(CommandsToken).resolveCommand('toggle:check')?.enabled).toBe(true);
    await kernel.destroy();
  });
});
