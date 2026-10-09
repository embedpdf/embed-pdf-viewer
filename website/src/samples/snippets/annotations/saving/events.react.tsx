import { useAnnotationEvent } from '@embedpdf/react/annotation';

export function ActivityLog() {
  useAnnotationEvent(
    (annotation) => annotation.onCreated,
    ({ annotation, origin }) => {
      console.log(`${annotation.author} added a ${annotation.subtype}`);
    },
  );

  return null;
}
