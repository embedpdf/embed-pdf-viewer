import { Anchored } from '@embedpdf/react/anchored';
import { type Annotation, useAnnotationAnchor, useCommentThread } from '@embedpdf/react/annotation';

export function ReplyCount({ note }: { note: Annotation }) {
  const anchor = useAnnotationAnchor(note.ref);
  const thread = useCommentThread(note.ref);

  return (
    <Anchored anchor={anchor} placement="right" gap={4} pinned>
      <span className="badge">{thread?.replies.length ?? 0}</span>
    </Anchored>
  );
}
