import { useAnnotationEvent } from '@embedpdf/react/annotation';

import { toast } from './toast';

export function SaveErrors() {
  useAnnotationEvent(
    (annotation) => annotation.onWriteFailed,
    ({ error }) => toast(`Couldn't save: ${error.message}`),
  );

  return null;
}
