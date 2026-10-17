/**
 * The labels the libraries give in English with a translation key beside them: the annotation
 * kinds' style properties and their options, and the form plugin's field settings. The viewer
 * shows each in its language, and the English where a language has no string for the key.
 */
import { useT } from '@embedpdf/react/i18n';

/** A label as the libraries give it: the English, and its key. */
export interface Labelled {
  readonly label: string;
  readonly labelKey: string;
}

/** Reads a {@link Labelled} in the viewer's language. */
export function useLabel(): (item: Labelled) => string {
  const t = useT();
  return (item) => t(item.labelKey, { fallback: item.label });
}
