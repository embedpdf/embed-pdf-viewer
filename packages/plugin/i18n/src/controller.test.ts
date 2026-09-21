import type { PluginContext } from '@embedpdf/core';
import { describe, expect, it } from 'vitest';

import type { I18nConfig, Locale } from './contract';
import { createI18nCapability } from './controller';
import { i18nReducer, initialI18nState, type I18nAction, type I18nState } from './model';

const en: Locale = {
  code: 'en',
  name: 'English',
  translations: { hi: 'Hello', nested: { a: 'A' } },
};
const nl: Locale = { code: 'nl', name: 'Nederlands', translations: { hi: 'Hallo' } };
const ar: Locale = { code: 'ar', name: 'العربية', dir: 'rtl', translations: { hi: 'مرحبا' } };

/** A live store: dispatch runs the real reducer and notifies subscribers, like the kernel. */
function harness(config: I18nConfig) {
  let state = initialI18nState(config);
  const listeners = new Set<() => void>();
  const ctx = {
    getState: () => state,
    dispatch: (action: I18nAction) => {
      state = i18nReducer(state, action);
      for (const l of listeners) l();
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    cleanup: () => {},
  } as unknown as PluginContext<I18nState, I18nAction>;
  return createI18nCapability(ctx, config);
}
const settle = () => new Promise((r) => setTimeout(r));

describe('i18n controller', () => {
  it('switches registered locales at once and announces the change', async () => {
    const i18n = harness({ locales: [en, nl, ar] });
    const seen: string[] = [];
    i18n.onLocaleChanged((e) => seen.push(`${e.previousLocale}>${e.locale}`));
    await i18n.setLocale('nl');
    expect(i18n.getLocale()).toBe('nl');
    expect(i18n.t('hi')).toBe('Hallo');
    await i18n.setLocale('ar');
    expect(i18n.getDirection()).toBe('rtl');
    expect(seen).toEqual(['en>nl', 'nl>ar']);
    await expect(i18n.setLocale('zz')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('fetches a lazy pack, resolves when usable, and rejects on failure', async () => {
    const i18n = harness({
      locales: [en],
      loaders: {
        nl: async () => nl,
        xx: async () => {
          throw new Error('offline');
        },
      },
    });
    expect(i18n.listLocales().map((l) => `${l.code}:${l.loaded}`)).toEqual([
      'en:true',
      'nl:false',
      'xx:false',
    ]);
    const failures: string[] = [];
    i18n.onLocaleLoadFailed((e) => failures.push(e.locale));
    await i18n.setLocale('nl');
    expect(i18n.getLocale()).toBe('nl');
    expect(i18n.listLocales().find((l) => l.code === 'nl')?.loaded).toBe(true);
    await expect(i18n.setLocale('xx')).rejects.toMatchObject({ code: 'operation-failed' });
    expect(failures).toEqual(['xx']);
    expect(i18n.getLocale()).toBe('nl');
  });

  it('registers packs with a remover and merges translations', async () => {
    const i18n = harness({ locales: [en] });
    const remove = i18n.registerLocale(nl);
    expect(i18n.listLocales()).toHaveLength(2);
    i18n.addTranslations('en', { nested: { b: 'B' }, hi: 'Hi there' });
    expect(i18n.t('nested.a')).toBe('A');
    expect(i18n.t('nested.b')).toBe('B');
    expect(i18n.t('hi')).toBe('Hi there');
    expect(i18n.hasKey('nested.b')).toBe(true);
    expect(i18n.hasKey('nope')).toBe(false);
    remove();
    expect(i18n.listLocales()).toHaveLength(1);
    expect(() => i18n.addTranslations('nl', { hi: 'x' })).toThrow();
    await settle();
  });
});
