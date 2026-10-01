/**
 * The i18n controller: reads over the state, the language verbs, the
 * `onLocaleChanged` derivation, and the loader wired at `connect`. Built
 * synchronously in `createKernel()`, so `t()` works before the engine exists.
 */
import {
  isPluginError,
  memo,
  PluginError,
  toPluginError,
  toPluginErrorInfo,
  type OperationOptions,
  type PluginContext,
  type Unsubscribe,
} from '@embedpdf/core';

import type {
  I18nCapability,
  I18nSettings,
  LocaleChangedEvent,
  LocaleInfo,
  LocaleLoadFailedEvent,
  TranslateOptions,
} from './contract';
import {
  addTranslations,
  endLocaleLoad,
  registerLocale,
  seedFromSettings,
  setLocale as setCurrentLocale,
  startLocaleLoad,
  unregisterLocale,
  type I18nState,
} from './model';
import { createLoaders } from './sync/loaders';
import { translate, type TranslationSources } from './translate';

const unknownLocale = (code: string) =>
  new PluginError('not-found', 'i18n', `unknown locale '${code}': not loaded and not in loaders`);

export function createI18nController(ctx: PluginContext<I18nState, I18nSettings>) {
  const settings = ctx.settings();
  const localeChanged = ctx.events.source<LocaleChangedEvent>();
  const localeLoadFailed = ctx.events.source<LocaleLoadFailedEvent>();

  const state = () => ctx.state.get();
  ctx.state.update(seedFromSettings, settings.get());

  // A language change is announced once it shows: never while a language is
  // still loading, and always against the language announced last.
  let announced = state().locale;
  ctx.state.onChange(({ next }) => {
    if (next.loading !== null || next.locale === announced) return;
    const previousLocale = announced;
    announced = next.locale;
    localeChanged.emit({ locale: next.locale, previousLocale });
  });

  const sources = (): TranslationSources => ({
    locale: state().locale,
    fallbackLocale: settings.get().fallbackLocale,
    locales: state().locales,
  });

  // A missing key would otherwise go unnoticed, since `t()` always returns
  // something to show: warn once per key.
  const warned = new Set<string>();
  const translateKey = (key: string, options?: TranslateOptions): string => {
    const result = translate(sources(), key, options);
    if (!result.found && options?.fallback === undefined && !warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing translation "${key}" (locale: ${state().locale})`);
    }
    return result.text;
  };

  /** A new translate function only when the strings it can return may differ. */
  const getTranslator = memo(
    () => [state().locale, state().locales, settings.get().fallbackLocale],
    (_locale, _locales, _fallbackLocale) => (key: string, options?: TranslateOptions) =>
      translateKey(key, options),
  );

  /** The languages a picker shows, rebuilt only when the languages or the loaders change. */
  const listLocales = memo(
    () => [state().locales, settings.get().loaders],
    (locales, loaders): readonly LocaleInfo[] => {
      const known: LocaleInfo[] = Object.values(locales).map((locale) => ({
        code: locale.code,
        name: locale.name,
        direction: locale.direction ?? 'ltr',
        loaded: true,
      }));
      for (const code of Object.keys(loaders)) {
        if (!locales[code]) known.push({ code, name: code, direction: 'ltr', loaded: false });
      }
      return known;
    },
  );

  /** The caller waiting for a language to load; a newer switch replaces it. */
  const pending = new Map<string, { resolve(): void; reject(error: unknown): void }>();
  const settle = (code: string, outcome: { ok: true } | { ok: false; error: unknown }) => {
    const waiter = pending.get(code);
    if (!waiter) return;
    pending.delete(code);
    if (outcome.ok) waiter.resolve();
    else waiter.reject(outcome.error);
  };
  const supersede = () => {
    for (const [code, waiter] of pending) {
      pending.delete(code);
      waiter.reject(
        new PluginError('operation-cancelled', 'i18n', `switching to '${code}' was replaced`),
      );
    }
  };
  const loaders = createLoaders(ctx, settings, { settle }, (locale, error) =>
    localeLoadFailed.emit({ locale, error: toPluginErrorInfo(toPluginError('i18n', error)) }),
  );

  const setLocale = (code: string, options: OperationOptions = {}): Promise<void> => {
    const { signal } = options;
    if (signal?.aborted) {
      return Promise.reject(new PluginError('operation-cancelled', 'i18n', 'operation cancelled'));
    }
    if (state().locales[code]) {
      supersede();
      ctx.state.update(setCurrentLocale, code);
      return Promise.resolve();
    }
    if (!settings.get().loaders[code]) return Promise.reject(unknownLocale(code));
    supersede();
    const loaded = new Promise<void>((resolve, reject) => {
      pending.set(code, { resolve, reject });
      ctx.state.update(startLocaleLoad, code);
    });
    // A cancelled switch stops waiting: the language still registers when it
    // arrives, but doesn't become current.
    signal?.addEventListener(
      'abort',
      () => {
        if (!pending.delete(code)) return;
        ctx.state.update(endLocaleLoad, code);
      },
      { once: true },
    );
    return ctx.cancellable(signal, loaded);
  };

  /** Follow a settings change: new languages register, and a new `locale` becomes current. */
  const followSettings = (): void => {
    let previous = settings.get();
    ctx.listen(settings.api.onSettingsChanged, ({ settings: next, changed }) => {
      if (changed.includes('locales')) {
        for (const locale of previous.locales) {
          if (!next.locales.some((other) => other.code === locale.code)) {
            ctx.state.update(unregisterLocale, locale.code);
          }
        }
        for (const locale of next.locales) {
          if (!previous.locales.includes(locale)) ctx.state.update(registerLocale, locale);
        }
      }
      if (changed.includes('locale')) {
        const code = next.locale ?? next.fallbackLocale;
        // A failed load fires onLocaleLoadFailed; only a code nothing knows needs saying here.
        setLocale(code).catch((error: unknown) => {
          if (isPluginError(error, 'not-found')) console.warn(`[i18n] ${error.message}`);
        });
      }
      previous = next;
    });
  };

  const api: I18nCapability = {
    ...settings.api,
    t: translateKey,
    getTranslator,
    hasKey: (key) => translate(sources(), key).found,
    getLocale: () => state().locale,
    getDirection: () => state().locales[state().locale]?.direction ?? 'ltr',
    listLocales,
    getLoadingLocale: () => state().loading,
    setLocale,
    registerLocale: (locale): Unsubscribe => {
      ctx.state.update(registerLocale, locale);
      return () => ctx.state.update(unregisterLocale, locale.code);
    },
    addTranslations: (code, translations) => {
      // A language in `loaders` takes strings before it has loaded; they merge in when it does.
      if (!state().locales[code] && !settings.get().loaders[code]) throw unknownLocale(code);
      ctx.state.update(addTranslations, code, translations);
    },
    onLocaleChanged: localeChanged.on,
    onLocaleLoadFailed: localeLoadFailed.on,
  };

  return {
    api,
    connect() {
      loaders.connect();
      followSettings();
    },
  };
}
