import { ReactNode } from '@framework';
import { useTranslation } from '../hooks';

interface TranslateProps {
  k: string; // translation key
  params?: Record<string, string | number>;
  children?: (translation: string) => ReactNode;
}

/**
 * Component for inline translation
 * @example <Translate k="commands.zoom.in" />
 * @example <Translate k="commands.zoom.level" params={{ level: 150 }} />
 */
export function Translate({ k, params, children }: TranslateProps) {
  const translation = useTranslation(k, params);

  if (children) {
    return children(translation);
  }

  return translation;
}
