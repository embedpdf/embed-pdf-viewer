import { inject, provide, type InjectionKey } from 'vue';
import type { UIRenderers } from '../types';

/**
 * Renderers Registry
 *
 * Provides access to user-supplied renderers (toolbar, panel, menu).
 */
const RenderersKey: InjectionKey<UIRenderers> = Symbol('Renderers');

export function provideRenderers(renderers: UIRenderers) {
  provide(RenderersKey, renderers);
}

export function useRenderers(): UIRenderers {
  const renderers = inject(RenderersKey);
  if (!renderers) {
    throw new Error('useRenderers must be used within UIProvider');
  }
  return renderers;
}
