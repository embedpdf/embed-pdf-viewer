/**
 * The i18n controller — reads over the state, the locale verbs, the
 * `onLocaleChanged` derivation, and the lazy loader wired at `connect`. Built
 * synchronously in `createKernel()`, so `t()` works before the engine
 * exists — including inside the shell's loading UI.
 */
import {
  memo,
  PluginError,
  toPluginError,
  toPluginErrorInfo,
  type PluginContext,
  type Unsubscribe,
} from '@embedpdf/core';

import type {
  I18nCapability,
  I18nConfig,
  LocaleChangedEvent,
  LocaleInfo,
  LocaleLoadFailedEvent,
  TranslateOptions,
} from './contract';
import {
  addTranslations,
  registerLocale,
  setLocale as setCurrentLocale,
  startLocaleLoad,
  unregisterLocale,
  type I18nState,
} from './model';
import { createLoaders } from './sync/loaders';
import { translate } from './translate';

export function createI18nController(ctx: PluginContext<I18nState>, config: I18nConfig = {}) {
  const localeChanged = ctx.events.source<LocaleChangedEvent>();
  const localeLoadFailed = ctx.events.source<LocaleLoadFailedEvent>();

  const state = () => ctx.state.get();

  // A locale change is announced once it is usable: never while a lazy pack
  // is still loading, and always against the locale announced last.
  let announced = state().locale;
  ctx.state.onChange(({ next }) => {
    if (next.loading !== null || next.locale === announced) return;
    const previousLocale = announced;
    announced = next.locale;
    localeChanged.emit({ locale: next.locale, previousLocale });
  });

  // Dev signal, once per offender — a missing key otherwise fails silently
  // (by design: `t()` always returns a usable string).
  const warned = new Set<string>();
  const warnOnce = (id: string, message: string) => {
    if (warned.has(id)) return;
    warned.add(id);
    console.warn(message);
  };

  const translateKey = (key: string, options?: TranslateOptions): string => {
    const result = translate(state(), key, options);
    if (!result.found && options?.fallback === undefined) {
      warnOnce(`key:${key}`, `[i18n] missing translation "${key}" (locale: ${state().locale})`);
    }
    return result.text;
  };

  /** A new translate function only when the strings it can return may differ. */
  const getTranslator = memo(
    () => [state().locale, state().locales],
    (_locale, _locales) => (key: string, options?: TranslateOptions) => translateKey(key, options),
  );

  /** The known-locale list, rebuilt only when the packs change. */
  const listLocales = memo(
    () => [state().locales],
    (locales): readonly LocaleInfo[] => {
      const known: LocaleInfo[] = Object.values(locales).map((locale) => ({
        code: locale.code,
        name: locale.name,
        dir: locale.dir ?? 'ltr',
        loaded: true,
      }));
      for (const code of Object.keys(config.loaders ?? {})) {
        if (!locales[code]) known.push({ code, name: code, dir: 'ltr', loaded: false });
      }
      return known;
    },
  );

  /** One pending promise per lazy load; a newer request supersedes it. */
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
        new PluginError('operation-cancelled', 'i18n', `switching to '${code}' was superseded`),
      );
    }
  };
  const loaders = createLoaders(ctx, config, { settle }, (locale, error) =>
    localeLoadFailed.emit({ locale, error: toPluginErrorInfo(toPluginError('i18n', error)) }),
  );

  const setLocale = (code: string): Promise<void> => {
    if (state().locales[code]) {
      supersede();
      ctx.state.update(setCurrentLocale, code);
      return Promise.resolve();
    }
    if (config.loaders?.[code]) {
      supersede();
      return new Promise<void>((resolve, reject) => {
        pending.set(code, { resolve, reject });
        ctx.state.update(startLocaleLoad, code);
      });
    }
    return Promise.reject(
      new PluginError(
        'not-found',
        'i18n',
        `unknown locale '${code}' — not registered and no loader configured`,
      ),
    );
  };

  const api: I18nCapability = {
    t: translateKey,
    getTranslator,
    hasKey: (key) => translate(state(), key).found,
    getLocale: () => state().locale,
    getDirection: () => {
      const { locales, locale } = state();
      return locales[locale]?.dir ?? 'ltr';
    },
    listLocales,
    getLoadingLocale: () => state().loading,
    setLocale,
    registerLocale: (locale): Unsubscribe => {
      ctx.state.update(registerLocale, locale);
      return () => ctx.state.update(unregisterLocale, locale.code);
    },
    addTranslations: (code, dictionary) => {
      if (!state().locales[code]) {
        throw new PluginError('not-found', 'i18n', `unknown locale '${code}'`);
      }
      ctx.state.update(addTranslations, code, dictionary);
    },
    onLocaleChanged: localeChanged.on,
    onLocaleLoadFailed: localeLoadFailed.on,
  };

  return {
    api,
    connect() {
      loaders.connect();
    },
  };
}
