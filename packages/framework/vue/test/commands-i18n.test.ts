import { computed, h, isRef, ref } from 'vue';
import type { Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { I18nToken } from '@embedpdf/plugin-i18n';
import {
  commandsPlugin,
  formatShortcut,
  useCommand,
  useCommandShortcuts,
  useCommandsEvent,
} from '../src/commands';
import type { BoundCommand } from '../src/commands';
import { i18nPlugin, useI18nState, useT } from '../src/i18n';
import { epdfTheme } from '../src/theme';
import { CounterToken, bytesInput, counterPlugin, probe, settle, viewerWith } from './counter-plugin';

/**
 * `useCommand(id)`: what a button needs, as a ref, with `run` bound to the
 * component's document and the shortcut formatted for the platform.
 * `useCommandShortcuts()`: keys bound while the component lives, on a target
 * once it mounts. `useI18nState()` and `useT()`: the language, with no
 * document. `epdfTheme()`: setting names as a style.
 */

enableAutoUnmount(afterEach);

const latest = <T>(renders: T[]): T => renders[renders.length - 1];

describe('useCommand', () => {
  it('gives the command as a ref, with a bound run and a formatted shortcut', async () => {
    const run = vi.fn();
    const plugins = [
      commandsPlugin({
        commands: [{ id: 'review:approve', label: 'Approve', shortcut: 'Mod+Enter', run }],
      }),
    ];
    let command: Readonly<Ref<BoundCommand | null>> | null = null;
    const Probe = probe(() => {
      command = useCommand('review:approve');
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe));
    await kernel.documents.open(bytesInput('a'));
    await settle();

    expect(isRef(command)).toBe(true);
    const bound = command!.value!;
    expect(bound).toMatchObject({ label: 'Approve', enabled: true });
    expect(bound.shortcut).toBe(formatShortcut('Mod+Enter'));
    await bound.run();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'a' }));
  });

  it('is null for an unknown id, and follows a getter', async () => {
    const id = ref('nope');
    const renders: (string | null)[] = [];
    const Probe = probe(() => {
      const command = useCommand(() => id.value);
      return () => {
        renders.push(command.value?.label ?? null);
        return null;
      };
    });
    await viewerWith(
      [commandsPlugin({ commands: [{ id: 'review:approve', label: 'Approve' }] })],
      () => h(Probe),
    );
    expect(latest(renders)).toBeNull();

    id.value = 'review:approve';
    await settle();
    expect(latest(renders)).toBe('Approve');
  });

  it('changes only when what the command shows changes', async () => {
    let pressed = false;
    const renders: boolean[] = [];
    const Probe = probe(() => {
      const command = useCommand('view:toggle');
      return () => {
        renders.push(command.value?.active ?? false);
        return null;
      };
    });
    const { kernel } = await viewerWith(
      [
        counterPlugin,
        commandsPlugin({
          commands: [{ id: 'view:toggle', label: 'Toggle', active: () => pressed }],
        }),
      ],
      () => h(Probe),
    );
    await kernel.documents.open(bytesInput('a'));
    await settle();
    const before = renders.length;
    const counter = kernel.capability(CounterToken, 'a');

    // A kernel change that leaves the command as it was renders nothing.
    counter.touch();
    await settle();
    expect(renders.length).toBe(before);

    pressed = true;
    counter.touch();
    await settle();
    expect(latest(renders)).toBe(true);
  });
});

describe('useCommandShortcuts', () => {
  const press = (target: EventTarget) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }),
    );

  it('runs a command from its key while focus is inside the target, and stops on unmount', async () => {
    const run = vi.fn();
    const ran = vi.fn();
    const Area = probe(() => {
      const area = ref<HTMLElement | null>(null);
      useCommandShortcuts({ isMac: false, target: area });
      useCommandsEvent((commands) => commands.onExecuted, ran);
      return () => h('div', { ref: area, 'data-testid': 'area', tabindex: 0 });
    });
    const shown = ref(true);
    const { wrapper } = await viewerWith(
      [commandsPlugin({ commands: [{ id: 'app:k', label: 'K', shortcut: 'Mod+K', run }] })],
      () => (shown.value ? h(Area) : null),
    );
    await settle();

    const area = wrapper.find('[data-testid="area"]').element;
    press(area);
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    expect(ran).toHaveBeenCalledWith(expect.objectContaining({ commandId: 'app:k' }));

    // Outside the target the key is the page's.
    press(document.body);
    await settle();
    expect(run).toHaveBeenCalledTimes(1);

    shown.value = false;
    await settle();
    press(area);
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('listens on the window without a target', async () => {
    const run = vi.fn();
    const Keys = probe(() => {
      useCommandShortcuts({ isMac: false });
    });
    await viewerWith(
      [commandsPlugin({ commands: [{ id: 'app:k', label: 'K', shortcut: 'Mod+K', run }] })],
      () => h(Keys),
    );
    press(document.body);
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
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
    const renders: unknown[] = [];
    const Probe = probe(() => {
      const t = useT();
      const { locale, direction } = useI18nState();
      return () => {
        renders.push({ locale: locale.value, direction: direction.value, label: t('commands.zoom.in') });
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins(), () => h(Probe));
    expect(latest(renders)).toEqual({ locale: 'en', direction: 'ltr', label: 'Zoom in' });

    await kernel.capability(I18nToken).setLocale('nl');
    await settle();
    expect(latest(renders)).toEqual({ locale: 'nl', direction: 'ltr', label: 'Inzoomen' });
    await kernel.capability(I18nToken).setLocale('ar');
    await settle();
    expect(latest(renders)).toMatchObject({ locale: 'ar', direction: 'rtl' });
  });

  it('useT reads the language in a computed too', async () => {
    let label: Readonly<Ref<string>> | null = null;
    const Probe = probe(() => {
      const t = useT();
      label = computed(() => t('commands.zoom.in'));
    });
    const { kernel } = await viewerWith(plugins(), () => h(Probe));
    expect(label!.value).toBe('Zoom in');

    await kernel.capability(I18nToken).setLocale('nl');
    await settle();
    expect(label!.value).toBe('Inzoomen');
  });
});

describe('epdfTheme', () => {
  it('is the theme as CSS variables, for a style binding', () => {
    expect(epdfTheme({ accent: '#e91e63', page: { shadow: 'none' } })).toEqual({
      '--epdf-accent': '#e91e63',
      '--epdf-page-shadow': 'none',
    });
  });
});
