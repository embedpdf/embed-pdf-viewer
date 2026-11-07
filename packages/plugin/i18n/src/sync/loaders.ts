/**
 * The plugin's only side effect: fetching languages from `loaders`. Driven by
 * state: a load is `state.loading`, set by `setLocale` (a switch to a language
 * still to load) or by the seeded state (a start language still to load), and
 * `state.loadingFallback`, the fallback language with a loader that hasn't run.
 * A load asked for before `connect` ran is picked up here. The language on its
 * way shows once it and the fallback language are in.
 */
import {
  PluginError,
  toPluginError,
  toPluginErrorInfo,
  type PluginContext,
  type Settings,
} from '@embedpdf/core';

import type { I18nSettings } from '../contract';
import {
  arriveLocale,
  endFallbackLoad,
  endLocaleLoad,
  isReady,
  needsFetch,
  setLocale,
  type I18nModel,
} from '../model';

export interface LoadSettlers {
  /** A load finished: the language shows (`ok`), or it failed (`error`). */
  settle(code: string, outcome: { ok: true } | { ok: false; error: unknown }): void;
}

export function createLoaders(
  ctx: PluginContext<I18nModel, I18nSettings>,
  settings: Settings<I18nSettings>,
  settlers: LoadSettlers,
  onFailed: (locale: string, error: unknown) => void,
) {
  const state = () => ctx.state.get();
  /** The languages whose loader is running: one fetch serves the switch and the fallback. */
  const fetching = new Set<string>();

  /** Show the language on its way once it can: the user may have switched again meanwhile. */
  const showWhenReady = (): void => {
    const code = state().loading;
    if (code === null || !isReady(state(), settings.get().loaders, code)) return;
    ctx.state.update(setLocale, code);
    settlers.settle(code, { ok: true });
  };

  const load = (code: string): void => {
    if (fetching.has(code)) return;
    const loader = settings.get().loaders[code];
    if (!loader || !needsFetch(state(), settings.get().loaders, code)) {
      // Nothing to fetch: the language is in, or its loader went away after it was asked for.
      if (!state().locales[code]) {
        ctx.state.update(endLocaleLoad, code);
        ctx.state.update(endFallbackLoad, code);
      }
      showWhenReady();
      return;
    }
    fetching.add(code);
    loader().then(
      (locale) => {
        fetching.delete(code);
        ctx.state.update(arriveLocale, code, locale);
        showWhenReady();
      },
      (error: unknown) => {
        fetching.delete(code);
        ctx.state.update(endLocaleLoad, code);
        ctx.state.update(endFallbackLoad, code);
        onFailed(code, error);
        settlers.settle(code, {
          ok: false,
          error: new PluginError('operation-failed', 'i18n', `locale '${code}' failed to load`, {
            details: toPluginErrorInfo(toPluginError('i18n', error)),
          }),
        });
        // Without its fallback language, the language on its way shows with what it has.
        showWhenReady();
      },
    );
  };

  /** Fetch the languages the state asks for at connect, and each one it asks for later. */
  const connect = (): void => {
    const loadRequested = (code: string | null) => {
      if (code) load(code);
      else showWhenReady();
    };
    loadRequested(state().loadingFallback);
    loadRequested(state().loading);
    ctx.watch(() => state().loadingFallback, loadRequested);
    ctx.watch(() => state().loading, loadRequested);
  };
  return { connect };
}
