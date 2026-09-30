import { useComments, type CommentThread } from '@embedpdf/react/annotation';

export function ThreadActions({ thread }: { thread: CommentThread }) {
  const comments = useComments();

  return (
    <>
      <button disabled={!comments.canReply(thread.root.ref)}>Reply</button>
      <button disabled={!comments.canDeleteThread(thread.root.ref)}>Delete thread</button>
    </>
  );
}
