import { useAnnotationEvent } from '@embedpdf/react/annotation';
import { toast } from './toast'; // your own

export function RemoteChanges() {
  useAnnotationEvent(
    (annotation) => annotation.onUpdated,
    ({ annotation, origin }) => {
      if (origin.kind === 'remote') toast(`${annotation.author} changed a comment`);
    },
  );

  return null;
}
