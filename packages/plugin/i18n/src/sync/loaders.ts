/**
 * The plugin's only side effect: fetching lazy locale packs. State-driven — a
 * load is `state.loading`, set by `setLocale` (a switch to a lazy pack) or by
 * the initial state (a lazy startup locale), so a load requested before
 * `connect` ran is picked up here and nothing is lost to boot ordering.
 */
import {
  PluginError,
  toPluginError,
  toPluginErrorInfo,
  type PluginContext,
} from '@embedpdf/core';

import type { I18nConfig } from '../contract';
import { registerLocale, failLocaleLoad, setLocale, type I18nState } from '../model';

export interface LoadSettlers {
  /** A load finished: the locale is usable (`ok`) or the pack failed (`error`). */
  settle(code: string, outcome: { ok: true } | { ok: false; error: unknown }): void;
}

export function createLoaders(
  ctx: PluginContext<I18nState>,
  config: I18nConfig,
  settlers: LoadSettlers,
  onFailed: (locale: string, error: unknown) => void,
) {
  const load = (code: string) => {
    const loader = config.loaders?.[code];
    if (!loader) return; // unreachable via the controller, which checks for a loader first
    loader().then(
      (locale) => {
        ctx.state.update(registerLocale, locale);
        // Complete the switch only if this load is still the wanted one —
        // the user may have switched again while the pack was in flight.
        if (ctx.state.get().loading === code) {
          ctx.state.update(setLocale, locale.code);
          settlers.settle(code, { ok: true });
        }
      },
      (error: unknown) => {
        ctx.state.update(failLocaleLoad, code);
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

  /** Fetch the pack `loading` names now, and each newly requested one after. */
  const connect = (): void => {
    const loadRequested = (code: string | null) => {
      if (code) load(code);
    };
    loadRequested(ctx.state.get().loading);
    ctx.watch(() => ctx.state.get().loading, loadRequested);
  };
  return { connect };
}
