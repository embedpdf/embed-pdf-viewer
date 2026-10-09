// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { commandsPlugin, formatShortcut, useCommand } from '../src/commands';
import type { BoundCommand } from '../src/commands';
import { i18nPlugin, useI18nState, useT } from '../src/i18n';
import { epdfTheme } from '../src/theme';
import { bytesInput, viewerWith } from './counter-plugin';

/**
 * `useCommand(id)`: what a button needs, with `run` bound to the component's document and the
 * shortcut formatted for the platform. `useI18nState()` and `useT()`: the language, with no
 * document. `epdfTheme()`: setting names as a style.
 */

afterEach(cleanup);

const latest = <T,>(renders: T[]): T => renders[renders.length - 1];

function CommandProbe({ id, renders }: { id: string; renders: (BoundCommand | null)[] }) {
  renders.push(useCommand(id));
  return null;
}

function LanguageProbe({ renders }: { renders: unknown[] }) {
  const t = useT();
  const { locale, direction } = useI18nState();
  renders.push({ locale, direction, label: t('commands.zoom.in') });
  return null;
}

describe('useCommand', () => {
  it('gives the command with a bound run and a formatted shortcut', async () => {
    const run = vi.fn();
    const plugins = [
      commandsPlugin({
        commands: [{ id: 'review:approve', label: 'Approve', shortcut: 'Mod+Enter', run }],
      }),
    ];
    const renders: (BoundCommand | null)[] = [];
    const { kernel } = await viewerWith(
      plugins,
      <CommandProbe id="review:approve" renders={renders} />,
    );
    await act(() => kernel.documents.open(bytesInput('a')));

    const command = latest(renders)!;
    expect(command).toMatchObject({ label: 'Approve', enabled: true });
    expect(command.shortcut).toBe(formatShortcut('Mod+Enter'));
    await act(() => command.run());
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'a' }));
  });

  it('is null for an unknown id', async () => {
    const renders: (BoundCommand | null)[] = [];
    await viewerWith([commandsPlugin()], <CommandProbe id="nope" renders={renders} />);
    expect(latest(renders)).toBeNull();
  });
});

describe('useI18nState and useT', () => {
  it('read the language with no document, and follow a switch', async () => {
    const plugins = [
      i18nPlugin({
        locales: [
          { code: 'en', name: 'English', translations: {} },
          { code: 'ar', name: 'العربية', direction: 'rtl', translations: {} },
          { code: 'nl', name: 'Nederlands', translations: {} },
        ],
      }),
    ];
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(plugins, <LanguageProbe renders={renders} />);
    expect(latest(renders)).toEqual({ locale: 'en', direction: 'ltr', label: 'Zoom in' });

    const { I18nToken } = await import('@embedpdf/plugin-i18n');
    await act(() => kernel.capability(I18nToken).setLocale('nl'));
    expect(latest(renders)).toEqual({ locale: 'nl', direction: 'ltr', label: 'Inzoomen' });
    await act(() => kernel.capability(I18nToken).setLocale('ar'));
    expect(latest(renders)).toMatchObject({ locale: 'ar', direction: 'rtl' });
  });
});

describe('epdfTheme', () => {
  it('is the theme as CSS variables, for a style prop', () => {
    expect(epdfTheme({ accent: '#e91e63', page: { shadow: 'none' } })).toEqual({
      '--epdf-accent': '#e91e63',
      '--epdf-page-shadow': 'none',
    });
  });
});
