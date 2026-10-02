/**
 * The plugin's only side effect: fetching languages from `loaders`. Driven by
 * state: a load is `state.loading`, set by `setLocale` (a switch to a language
 * still to load) or by the seeded state (a start language still to load), so a
 * load asked for before `connect` ran is picked up here.
 */
import {
  PluginError,
  toPluginError,
  toPluginErrorInfo,
  type PluginContext,
  type Settings,
} from '@embedpdf/core';

import type { I18nSettings } from '../contract';
import { endLocaleLoad, registerLocale, setLocale, type I18nState } from '../model';

export interface LoadSettlers {
  /** A load finished: the language shows (`ok`), or it failed (`error`). */
  settle(code: string, outcome: { ok: true } | { ok: false; error: unknown }): void;
}

export function createLoaders(
  ctx: PluginContext<I18nState, I18nSettings>,
  settings: Settings<I18nSettings>,
  settlers: LoadSettlers,
  onFailed: (locale: string, error: unknown) => void,
) {
  const load = (code: string) => {
    const loader = settings.get().loaders[code];
    if (!loader) {
      // The loader went away after the switch asked for it.
      ctx.state.update(endLocaleLoad, code);
      return;
    }
    loader().then(
      (locale) => {
        ctx.state.update(registerLocale, locale);
        // Switch only if this load is still the wanted one: the user may have
        // switched again while the language was on its way.
        if (ctx.state.get().loading === code) {
          ctx.state.update(setLocale, locale.code);
          settlers.settle(code, { ok: true });
        }
      },
      (error: unknown) => {
        ctx.state.update(endLocaleLoad, code);
        onFailed(code, error);
        settlers.settle(code, {
          ok: false,
          error: new PluginError('operation-failed', 'i18n', `locale '${code}' failed to load`, {
            details: toPluginErrorInfo(toPluginError('i18n', error)),
          }),
        });
      },
    );
  };

  /** Fetch the language `loading` names now, and each one asked for after. */
  const connect = (): void => {
    const loadRequested = (code: string | null) => {
      if (code) load(code);
    };
    loadRequested(ctx.state.get().loading);
    ctx.watch(() => ctx.state.get().loading, loadRequested);
  };
  return { connect };
}
