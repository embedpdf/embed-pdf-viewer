import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { I18nToken } from '@embedpdf/plugin-i18n';
import { commandsPlugin, formatShortcut, useCommand } from '../../src/commands';
import type { BoundCommand } from '../../src/commands';
import { i18nPlugin, useI18nState, useT } from '../../src/i18n';
import { epdfTheme } from '../../src/runtime';
import type { CurrentValue } from '../../src/runtime';
import CommandIdProbe from '../fixtures/CommandIdProbe.svelte';
import { CounterToken, bytesInput, counterPlugin } from '../fixtures/counter-plugin';
import Probes from '../fixtures/Probes.svelte';
import ShortcutArea from '../fixtures/ShortcutArea.svelte';
import WindowShortcuts from '../fixtures/WindowShortcuts.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * `useCommand(id)`: what a button needs, as `{ current }`, with `run` bound to the component's
 * document and the shortcut formatted for the platform. `useCommandShortcuts()`: keys bound while
 * the component lives, on a target once it mounts. `useI18nState()` and `useT()`: the language,
 * with no document. `epdfTheme()`: setting names as a style.
 */

/** A probe that records `pick(reader())` on every change. */
const probe = <Result>(read: () => Result, pick: (result: Result) => unknown) => {
  const seen: unknown[] = [];
  return { read, pick: pick as (result: unknown) => unknown, seen };
};

describe('useCommand', () => {
  it('gives the command with a bound run and a formatted shortcut', async () => {
    const run = vi.fn();
    const plugins = [
      commandsPlugin({
        commands: [{ id: 'review:approve', label: 'Approve', shortcut: 'Mod+Enter', run }],
      }),
    ];
    let command: CurrentValue<BoundCommand | null> | null = null;
    const approve = probe(
      () => (command = useCommand('review:approve')),
      (value) => value.current,
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [approve] });
    await kernel.documents.open(bytesInput('a'));
    flushSync();

    const bound = command!.current!;
    expect(bound).toMatchObject({ label: 'Approve', enabled: true });
    expect(bound.shortcut).toBe(formatShortcut('Mod+Enter'));
    await bound.run();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'a' }));
  });

  it('is null for an unknown id, and follows an id given as a function', async () => {
    const seen: (string | null)[] = [];
    const { view } = await viewerWith(
      [commandsPlugin({ commands: [{ id: 'review:approve', label: 'Approve' }] })],
      CommandIdProbe,
      { id: 'nope', seen },
    );
    expect(latest(seen)).toBeNull();

    await view.rerender({ contentProps: { id: 'review:approve', seen } });
    flushSync();
    expect(latest(seen)).toBe('Approve');
  });

  it('changes only when what the command shows changes', async () => {
    let pressed = false;
    const toggle = probe(
      () => useCommand('view:toggle'),
      (command) => command.current?.active ?? false,
    );
    const { kernel } = await viewerWith(
      [
        counterPlugin,
        commandsPlugin({
          commands: [{ id: 'view:toggle', label: 'Toggle', active: () => pressed }],
        }),
      ],
      Probes,
      { probes: [toggle] },
    );
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const before = toggle.seen.length;
    const counter = kernel.capability(CounterToken, 'a');

    // A kernel change that leaves the command as it was wakes nothing.
    counter.touch();
    flushSync();
    expect(toggle.seen).toHaveLength(before);

    pressed = true;
    counter.touch();
    flushSync();
    expect(latest(toggle.seen)).toBe(true);
  });
});

describe('useCommandShortcuts', () => {
  const press = (target: EventTarget) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }),
    );
  const plugins = (run: () => void) => [
    commandsPlugin({ commands: [{ id: 'app:k', label: 'K', shortcut: 'Mod+K', run }] }),
  ];

  it('runs a command from its key while focus is inside the target, and stops on unmount', async () => {
    const run = vi.fn();
    const ran = vi.fn();
    const { view } = await viewerWith(plugins(run), ShortcutArea, { ran });
    flushSync();

    const area = view.getByTestId('area');
    press(area);
    // The event follows once the command has run.
    await vi.waitFor(() =>
      expect(ran).toHaveBeenCalledWith(expect.objectContaining({ commandId: 'app:k' })),
    );
    expect(run).toHaveBeenCalledTimes(1);

    // Outside the target the key is the page's.
    press(document.body);
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    view.unmount();
    press(area);
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('listens on the window without a target', async () => {
    const run = vi.fn();
    await viewerWith(plugins(run), WindowShortcuts);
    flushSync();
    press(document.body);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });
});

describe('useI18nState and useT', () => {
  const plugins = () => [
    i18nPlugin({
      locales: [
        { code: 'en', name: 'English', translations: {} },
        { code: 'ar', name: 'العربية', direction: 'rtl', translations: {} },
        { code: 'nl', name: 'Nederlands', translations: {} },
      ],
    }),
  ];

  it('read the language with no document, and follow a switch', async () => {
    const language = probe(
      () => ({ t: useT(), i18n: useI18nState() }),
      ({ t, i18n }) => ({
        locale: i18n.locale,
        direction: i18n.direction,
        label: t('commands.zoom.in'),
      }),
    );
    const { kernel } = await viewerWith(plugins(), Probes, { probes: [language] });
    expect(latest(language.seen)).toEqual({ locale: 'en', direction: 'ltr', label: 'Zoom in' });

    await kernel.capability(I18nToken).setLocale('nl');
    flushSync();
    expect(latest(language.seen)).toEqual({ locale: 'nl', direction: 'ltr', label: 'Inzoomen' });
    await kernel.capability(I18nToken).setLocale('ar');
    flushSync();
    expect(latest(language.seen)).toMatchObject({ locale: 'ar', direction: 'rtl' });
  });

  it('useT alone wakes a reaction when the language changes', async () => {
    const label = probe(
      () => useT(),
      (t) => t('commands.zoom.in'),
    );
    const { kernel } = await viewerWith(plugins(), Probes, { probes: [label] });
    expect(label.seen).toEqual(['Zoom in']);

    await kernel.capability(I18nToken).setLocale('nl');
    flushSync();
    expect(label.seen).toEqual(['Zoom in', 'Inzoomen']);
  });
});

describe('epdfTheme', () => {
  it('is the theme as CSS variables, for a style attribute', () => {
    expect(epdfTheme({ accent: '#e91e63', page: { shadow: 'none' } })).toBe(
      '--epdf-accent: #e91e63; --epdf-page-shadow: none;',
    );
  });
});
