import { createTestContext } from '@embedpdf/core/testing';
import { describe, expect, it } from 'vitest';

import type { I18nConfig, Locale } from '../src/contract';
import { createI18nController } from '../src/controller';
import { initialI18nState } from '../src/model';

const en: Locale = {
  code: 'en',
  name: 'English',
  translations: { hi: 'Hello', nested: { first: 'A' } },
};
const nl: Locale = { code: 'nl', name: 'Nederlands', translations: { hi: 'Hallo' } };
const ar: Locale = { code: 'ar', name: 'العربية', dir: 'rtl', translations: { hi: 'مرحبا' } };

/** The controller over a real test context, connected as the kernel would. */
function harness(config: I18nConfig) {
  const ctx = createTestContext({ id: 'i18n', state: initialI18nState(config), doc: null });
  return ctx.connect(createI18nController(ctx, config));
}

/** A promise with its settle functions, for a loader the test resolves by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('i18n controller', () => {
  it('switches registered locales at once and announces the change', async () => {
    const i18n = harness({ locales: [en, nl, ar] });
    const seen: string[] = [];
    i18n.onLocaleChanged((event) => seen.push(`${event.previousLocale}>${event.locale}`));
    await i18n.setLocale('nl');
    expect(i18n.getLocale()).toBe('nl');
    expect(i18n.t('hi')).toBe('Hallo');
    await i18n.setLocale('ar');
    expect(i18n.getDirection()).toBe('rtl');
    await i18n.setLocale('ar'); // already current: no second announcement
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
    expect(i18n.listLocales().map((locale) => `${locale.code}:${locale.loaded}`)).toEqual([
      'en:true',
      'nl:false',
      'xx:false',
    ]);
    const failures: string[] = [];
    i18n.onLocaleLoadFailed((event) => failures.push(event.locale));
    await i18n.setLocale('nl');
    expect(i18n.getLocale()).toBe('nl');
    expect(i18n.listLocales().find((locale) => locale.code === 'nl')?.loaded).toBe(true);
    await expect(i18n.setLocale('xx')).rejects.toMatchObject({ code: 'operation-failed' });
    expect(failures).toEqual(['xx']);
    expect(i18n.getLocale()).toBe('nl');
    expect(i18n.getLoadingLocale()).toBeNull();
  });

  it('announces a lazy switch only once the pack has loaded', async () => {
    const pack = deferred<Locale>();
    const i18n = harness({ locales: [en], loaders: { nl: () => pack.promise } });
    const seen: string[] = [];
    i18n.onLocaleChanged((event) => seen.push(`${event.previousLocale}>${event.locale}`));
    const switched = i18n.setLocale('nl');
    expect(i18n.getLoadingLocale()).toBe('nl');
    expect(seen).toEqual([]);
    pack.resolve(nl);
    await switched;
    expect(seen).toEqual(['en>nl']);
  });

  it('does not announce a lazy startup locale when its pack arrives', async () => {
    const i18n = harness({ locales: [en], locale: 'ar', loaders: { ar: async () => ar } });
    const seen: string[] = [];
    i18n.onLocaleChanged((event) => seen.push(event.locale));
    expect(i18n.getLoadingLocale()).toBe('ar');
    expect(i18n.t('hi')).toBe('Hello'); // the fallback chain until the pack lands
    await flush();
    expect(i18n.getLoadingLocale()).toBeNull();
    expect(i18n.t('hi')).toBe('مرحبا');
    expect(seen).toEqual([]);
  });

  it('supersedes a pending lazy switch with a newer one', async () => {
    const pack = deferred<Locale>();
    const i18n = harness({ locales: [en, ar], loaders: { nl: () => pack.promise } });
    const pending = i18n.setLocale('nl');
    await i18n.setLocale('ar');
    await expect(pending).rejects.toMatchObject({ code: 'operation-cancelled' });
    pack.resolve(nl);
    await flush();
    expect(i18n.getLocale()).toBe('ar');
    expect(i18n.listLocales().find((locale) => locale.code === 'nl')?.loaded).toBe(true);
  });

  it('registers packs with a remover and merges translations', () => {
    const i18n = harness({ locales: [en] });
    const remove = i18n.registerLocale(nl);
    expect(i18n.listLocales()).toHaveLength(2);
    i18n.addTranslations('en', { nested: { second: 'B' }, hi: 'Hi there' });
    expect(i18n.t('nested.first')).toBe('A');
    expect(i18n.t('nested.second')).toBe('B');
    expect(i18n.t('hi')).toBe('Hi there');
    expect(i18n.hasKey('nested.second')).toBe(true);
    expect(i18n.hasKey('nope')).toBe(false);
    remove();
    expect(i18n.listLocales()).toHaveLength(1);
    expect(() => i18n.addTranslations('nl', { hi: 'x' })).toThrow(
      expect.objectContaining({ code: 'not-found' }),
    );
  });

  it('keeps the locale list reference-stable until the packs change', () => {
    const i18n = harness({ locales: [en] });
    const list = i18n.listLocales();
    expect(i18n.listLocales()).toBe(list);
    i18n.registerLocale(nl);
    expect(i18n.listLocales()).not.toBe(list);
  });

  it('keeps the translator until the locale or the translations change', async () => {
    const pack = deferred<Locale>();
    const i18n = harness({ locales: [en, nl], loaders: { ar: () => pack.promise } });
    const translator = i18n.getTranslator();
    expect(translator('hi')).toBe('Hello');
    expect(i18n.getTranslator()).toBe(translator);

    // A lazy load starting changes neither the locale nor the packs.
    const switched = i18n.setLocale('ar');
    expect(i18n.getTranslator()).toBe(translator);

    await i18n.setLocale('nl');
    await expect(switched).rejects.toMatchObject({ code: 'operation-cancelled' });
    const dutch = i18n.getTranslator();
    expect(dutch).not.toBe(translator);
    expect(dutch('hi')).toBe('Hallo');

    i18n.addTranslations('nl', { bye: 'Doei' });
    const extended = i18n.getTranslator();
    expect(extended).not.toBe(dutch);
    expect(extended('bye')).toBe('Doei');

    i18n.registerLocale(ar);
    expect(i18n.getTranslator()).not.toBe(extended);
  });
});
