import { ReactNode } from '@framework';
import { useTranslation } from '../hooks';

interface TranslateProps {
  k: string; // translation key
  params?: Record<string, string | number>;
  fallback?: string; // Fallback string if translation not found
  documentId?: string; // Optional document ID for document-scoped translations
  children?: (translation: string) => ReactNode;
}

/**
 * Component for inline translation
 *
 * @example
 * // Global translation
 * <Translate k="loading.viewer" />
 *
 * @example
 * // With explicit params
 * <Translate k="zoom.level" params={{ level: 150 }} />
 *
 * @example
 * // With fallback
 * <Translate k="unknown.key" fallback="Default Text" />
 *
 * @example
 * // Document-scoped (uses param resolvers)
 * <Translate k="page.current" documentId={documentId} />
 *
 * @example
 * // With render prop
 * <Translate k="zoom.level" params={{ level: 150 }}>
 *   {(text) => <span className="font-bold">{text}</span>}
 * </Translate>
 */
export function Translate({ k, params, fallback, documentId, children }: TranslateProps) {
  const translation = useTranslation(k, { params, fallback }, documentId);

  if (children) {
    return children(translation);
  }

  return translation;
}
