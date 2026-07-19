import type { EffectContext } from '@embedpdf/core';
import type { I18nAction, I18nConfig, I18nState } from './types';

/**
 * The plugin's ONE side-effect: fetching lazy locale packs. State-driven — a
 * load is `state.loading`, set by the capability (a switch to a lazy pack) or
 * by the initial state (a lazy startup locale), so a load requested before
 * effects ran is picked up here and nothing is lost to boot ordering.
 */
export function registerI18nEffects(config: I18nConfig) {
  return (ctx: EffectContext<I18nState, I18nAction>): void => {
    const load = (code: string) => {
      const loader = config.loaders?.[code];
      if (!loader) return; // unreachable via the capability; guards bad dispatches
      loader().then(
        (locale) => {
          ctx.dispatch({ type: 'I18N/REGISTER_LOCALE', locale });
          // Complete the switch only if this load is still the wanted one —
          // the user may have switched again while the pack was in flight.
          if (ctx.getState().loading === code) {
            ctx.dispatch({ type: 'I18N/SET_LOCALE', locale: locale.code });
          }
        },
        () => ctx.dispatch({ type: 'I18N/LOAD_FAILED', locale: code }),
      );
    };

    const pending = ctx.getState().loading;
    if (pending) load(pending);
    ctx.watch(
      () => ctx.getState().loading,
      (code) => {
        if (code) load(code);
      },
    );
  };
}
