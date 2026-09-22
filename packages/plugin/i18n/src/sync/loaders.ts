/**
 * The plugin's ONE side-effect: fetching lazy locale packs. State-driven — a
 * load is `state.loading`, set by `setLocale` (a switch to a lazy pack) or by
 * the initial state (a lazy startup locale), so a load requested before
 * `connect` ran is picked up here and nothing is lost to boot ordering.
 */
import { PluginError, toPluginError, toPluginErrorInfo, type PluginContext } from '@embedpdf/core';

import type { I18nConfig } from '../contract';
import type { I18nAction, I18nState } from '../model';

export interface LoadSettlers {
  /** A load finished: the locale is usable (`ok`) or the pack failed (`error`). */
  settle(code: string, outcome: { ok: true } | { ok: false; error: unknown }): void;
}

export function createLoaders(
  ctx: PluginContext<I18nState, I18nAction>,
  config: I18nConfig,
  settlers: LoadSettlers,
  onFailed: (locale: string, error: unknown) => void,
) {
  const load = (code: string) => {
    const loader = config.loaders?.[code];
    if (!loader) return; // unreachable via the controller; guards bad dispatches
    loader().then(
      (locale) => {
        ctx.dispatch({ type: 'I18N/REGISTER_LOCALE', locale });
        // Complete the switch only if this load is still the wanted one —
        // the user may have switched again while the pack was in flight.
        if (ctx.getState().loading === code) {
          ctx.dispatch({ type: 'I18N/SET_LOCALE', locale: locale.code });
          settlers.settle(code, { ok: true });
        }
      },
      (error: unknown) => {
        ctx.dispatch({ type: 'I18N/LOAD_FAILED', locale: code });
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

  /** Watch `loading` and fetch each newly requested pack. */
  const connect = (): void => {
    let last: string | null = null;
    const check = () => {
      const code = ctx.getState().loading;
      if (code === last) return;
      last = code;
      if (code) load(code);
    };
    check();
    ctx.cleanup(ctx.subscribe(check));
  };
  return { connect };
}
