import type { EffectContext } from '@embedpdf/core';
import { StageToken, type StageViewState } from '@embedpdf/plugin-stage';
import type { PersistConfig } from './types';

/** localStorage can throw on mere access (Safari private mode, sandboxed/opaque origins). */
function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Persist & restore the Stage's view-state. Restore is NOT a race against home():
 * persist merely OFFERS the saved view as a candidate (priority 50); the Stage's
 * single placement owner decides. The save side is a plain debounced effect.
 * (In a real build, storage would be an injected port so this never touches the DOM.)
 */
export function registerPersistEffects(ctx: EffectContext<unknown>, config: PersistConfig): void {
  const stage = ctx.get(StageToken); // typed via the token — no cast, no string
  const storage = safeStorage();
  if (!storage) return;

  // per-document key, so each open document persists its own view independently
  const key = `${config.key}:${ctx.documentId ?? 'default'}`;

  let saved: string | null = null;
  try {
    saved = storage.getItem(key);
  } catch {
    saved = null;
  }

  // Offer the saved view to the Stage's placement resolver. Captured once, so a
  // later save can't change what we restore to.
  stage.provideInitialView(50, () => {
    if (!saved) return null;
    try {
      return JSON.parse(saved) as StageViewState;
    } catch {
      return null;
    }
  });

  // Persist on change — debounced, serialized so the comparison is stable.
  let timer: ReturnType<typeof setTimeout> | undefined;
  ctx.watch(
    () => JSON.stringify(stage.viewState()),
    (json) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          storage.setItem(key, json);
        } catch {
          /* storage full or unavailable — drop silently */
        }
      }, 200);
    },
  );
  ctx.cleanup(() => clearTimeout(timer));
}
