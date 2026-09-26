import { PageEditToken, type PageEditCapability } from '@embedpdf/plugin-page-edit';
import { useCapability } from './runtime';

/**
 * The page-edit capability, bound to the surrounding `DocumentScope`.
 *
 * Thin idiomatic wrapper over `PageEditToken` — the relative→absolute rotation
 * and page addressing live in the plugin, so this hook (and its Vue/Svelte/
 * Angular siblings) is pure binding sugar with no logic to drift.
 *
 *   const editor = usePageEditor();
 *   editor.rotateBy(page.ref, 90);
 *   if (editor.canEdit()) { … }
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-page-edit';
export function usePageEditor(): PageEditCapability {
  return useCapability(PageEditToken);
}
