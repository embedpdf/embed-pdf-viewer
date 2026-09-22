/**
 * The i18n controller — reads over the slice, the locale intents, and the
 * lazy loader wired at `connect`. Built synchronously in `createKernel()`, so
 * `t()` works before the engine exists — including inside the shell's
 * loading UI.
 */
import {
  createEventHook,
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
} from './contract';
import type { I18nHostCapability } from './host-contract';
import type { I18nAction, I18nState } from './model';
import { createLoaders } from './sync/loaders';
import { translate } from './translate';

export function createI18nController(
  ctx: PluginContext<I18nState, I18nAction>,
  config: I18nConfig = {},
): { api: I18nHostCapability; connect(): void } {
  const report = (error: unknown) => globalThis.console?.error('[i18n] listener failed:', error);
  const localeChanged = createEventHook<LocaleChangedEvent>(report);
  const localeLoadFailed = createEventHook<LocaleLoadFailedEvent>(report);
  ctx.cleanup(() => {
    localeChanged.dispose();
    localeLoadFailed.dispose();
  });

  // Dev signal, once per offender — a missing key otherwise fails silently
  // (by design: `t()` always returns a usable string).
  const warned = new Set<string>();
  const warnOnce = (id: string, message: string) => {
    if (warned.has(id)) return;
    warned.add(id);
    console.warn(message);
  };

  /** The known-locale list, rebuilt only when the packs change. */
  let listedFor: I18nState['locales'] | null = null;
  let listed: readonly LocaleInfo[] = [];
  const listLocales = (): readonly LocaleInfo[] => {
    const { locales } = ctx.getState();
    if (listedFor === locales) return listed;
    const known: LocaleInfo[] = Object.values(locales).map((locale) => ({
      code: locale.code,
      name: locale.name,
      dir: locale.dir ?? 'ltr',
      loaded: true,
    }));
    for (const code of Object.keys(config.loaders ?? {})) {
      if (!locales[code]) known.push({ code, name: code, dir: 'ltr', loaded: false });
    }
    listedFor = locales;
    listed = known;
    return listed;
  };

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
  // A load completing switches the locale from inside the loader: announce it here.
  let announced = ctx.getState().locale;
  const announceIfChanged = () => {
    const now = ctx.getState().locale;
    if (now === announced || ctx.getState().loading !== null) return;
    const previousLocale = announced;
    announced = now;
    localeChanged.emit({ locale: now, previousLocale });
  };

  const setLocale = (code: string): Promise<void> => {
    const state = ctx.getState();
    if (state.locales[code]) {
      supersede();
      ctx.dispatch({ type: 'I18N/SET_LOCALE', locale: code });
      announceIfChanged();
      return Promise.resolve();
    }
    if (config.loaders?.[code]) {
      supersede();
      return new Promise<void>((resolve, reject) => {
        pending.set(code, { resolve, reject });
        ctx.dispatch({ type: 'I18N/LOAD_STARTED', locale: code });
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

  const api = {
    t: (key, options) => {
      const result = translate(ctx.getState(), key, options);
      if (!result.found && options?.fallback === undefined) {
        warnOnce(
          `key:${key}`,
          `[i18n] missing translation "${key}" (locale: ${ctx.getState().locale})`,
        );
      }
      return result.text;
    },
    hasKey: (key) => translate(ctx.getState(), key).found,
    getLocale: () => ctx.getState().locale,
    getDirection: () => {
      const { locales, locale } = ctx.getState();
      return locales[locale]?.dir ?? 'ltr';
    },
    listLocales,
    getLoadingLocale: () => ctx.getState().loading,
    setLocale,
    registerLocale: (locale): Unsubscribe => {
      ctx.dispatch({ type: 'I18N/REGISTER_LOCALE', locale });
      return () => ctx.dispatch({ type: 'I18N/UNREGISTER_LOCALE', locale: locale.code });
    },
    addTranslations: (code, dictionary) => {
      if (!ctx.getState().locales[code]) {
        throw new PluginError('not-found', 'i18n', `unknown locale '${code}'`);
      }
      ctx.dispatch({ type: 'I18N/ADD_TRANSLATIONS', locale: code, translations: dictionary });
    },
    onLocaleChanged: localeChanged.on,
    onLocaleLoadFailed: localeLoadFailed.on,
  } satisfies I18nCapability;

  return {
    api,
    connect() {
      loaders.connect();
      ctx.cleanup(ctx.subscribe(announceIfChanged));
    },
  };
}

/** The capability alone, connected at once — the shape unit tests build. */
export function createI18nCapability(
  ctx: PluginContext<I18nState, I18nAction>,
  config: I18nConfig = {},
): I18nHostCapability {
  const { api, connect } = createI18nController(ctx, config);
  connect();
  return api;
}
