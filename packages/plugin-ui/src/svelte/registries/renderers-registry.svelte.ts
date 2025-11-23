import { getContext, setContext } from 'svelte';
import type { UIRenderers } from '../types';

/**
 * Renderers Registry
 *
 * Provides access to user-supplied renderers (toolbar, panel, menu).
 */
const RENDERERS_KEY = Symbol('Renderers');

export function provideRenderers(renderers: UIRenderers) {
  setContext(RENDERERS_KEY, renderers);
}

export function useRenderers(): UIRenderers {
  const renderers = getContext<UIRenderers>(RENDERERS_KEY);
  if (!renderers) {
    throw new Error('useRenderers must be used within UIProvider');
  }
  return renderers;
}
