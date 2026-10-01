import type { AnnotationRendererProps } from '@embedpdf/react/annotation';

// It fills its frame (`width` and `height` 100% in your CSS), so the selection
// outline and the click area match it, and it turns with the annotation.
export function CommentBubble({ annotation, hovered }: AnnotationRendererProps) {
  return (
    <div className={hovered ? 'bubble bubble--hover' : 'bubble'}>
      {annotation.author?.[0] ?? '?'}
    </div>
  );
}
