import { useRegisterRenderers } from '@embedpdf/plugin-annotation/@framework';
import { formRenderers } from './form-renderers';

/**
 * Utility component that registers form field renderers once at app level.
 * Added via addUtility() so it mounts once, not per-page.
 */
export function FormRendererRegistration() {
  useRegisterRenderers(formRenderers);
  return null;
}
