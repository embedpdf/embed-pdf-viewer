import { useSelectionEvent } from '@embedpdf/react/selection';

import { prefetchTranslation } from './translation';

export function TranslationPrefetch() {
  useSelectionEvent(
    (selection) => selection.onCommitted,
    () => prefetchTranslation(),
  );

  return null;
}
