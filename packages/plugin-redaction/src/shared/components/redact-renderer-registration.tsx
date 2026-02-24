import { useRegisterRenderers } from '@embedpdf/plugin-annotation/@framework';
import { redactRenderers } from '../components/redact-renderers';

/**
 * Utility component that registers redact renderers once at app level.
 * Added via addUtility() so it mounts once, not per-page.
 */
export function RedactRendererRegistration() {
  useRegisterRenderers(redactRenderers);
  return null;
}
