import type { PluginContext } from '@embedpdf/core';
import { translate } from './translate';
import type { I18nAction, I18nCapability, I18nConfig, I18nState, LocaleInfo } from './types';

/**
 * The i18n capability — selectors (pure reads over state) + intents (the only
 * writers). Built synchronously in `createKernel()`, so `t()` works before the
 * engine exists — including inside the viewer shell's loading UI.
 */
export function createI18nCapability(
  ctx: PluginContext<I18nState, I18nAction>,
  config: I18nConfig,
): I18nCapability {
  // Dev signal, once per offender — a missing key otherwise fails silently
  // (by design: `t()` always returns a usable string).
  const warned = new Set<string>();
  const warnOnce = (id: string, message: string) => {
    if (warned.has(id)) return;
    warned.add(id);
    console.warn(message);
  };

  return {
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
    locale: () => ctx.getState().locale,
    dir: () => {
      const { locales, locale } = ctx.getState();
      return locales[locale]?.dir ?? 'ltr';
    },
    locales: () => {
      const { locales } = ctx.getState();
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
    loading: () => ctx.getState().loading,
    setLocale: (code) => {
      const state = ctx.getState();
      if (state.locales[code]) {
        ctx.dispatch({ type: 'I18N/SET_LOCALE', locale: code });
      } else if (config.loaders?.[code]) {
        ctx.dispatch({ type: 'I18N/LOAD_STARTED', locale: code });
      } else {
        warnOnce(
          `locale:${code}`,
          `[i18n] unknown locale "${code}" — not registered and no loader configured`,
        );
      }
    },
    registerLocale: (locale) => ctx.dispatch({ type: 'I18N/REGISTER_LOCALE', locale }),
  };
}
