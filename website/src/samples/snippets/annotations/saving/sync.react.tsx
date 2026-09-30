import { annotationKey, useAnnotationEvent } from '@embedpdf/react/annotation';
import { api } from './api'; // your own

export function SyncToServer() {
  useAnnotationEvent(
    (annotation) => annotation.onCreated,
    ({ annotation, origin }) => {
      if (origin.kind === 'local')
        api.put(`/annotations/${annotationKey(annotation.ref)}`, annotation);
    },
  );

  return null;
}
