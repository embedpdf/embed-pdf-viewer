import { useAnnotationEvent } from '@embedpdf/react/annotation';
import { notifyThreadAuthor } from './notifications'; // your own

export function CommentsSidebar() {
  useAnnotationEvent(
    (annotation) => annotation.comments.onThreadChanged,
    ({ rootRef, change }) => change === 'reply' && notifyThreadAuthor(rootRef),
  );

  return <aside>{/* … */}</aside>;
}
