import { useAnnotation, type AnnotationRef } from '@embedpdf/react/annotation';
import { DrawingTools } from './drawing-tools';

export function AnnotationActions({ annotationRef }: { annotationRef: AnnotationRef }) {
  const annotation = useAnnotation();

  return (
    <>
      {annotation.canCreate() && <DrawingTools />}
      <button disabled={!annotation.canDelete(annotationRef)}>Delete</button>
    </>
  );
}
