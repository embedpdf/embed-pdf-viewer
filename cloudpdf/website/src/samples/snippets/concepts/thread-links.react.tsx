import { annotationKey, useCommentThreads } from '@embedpdf/react/annotation';
import { useStage } from '@embedpdf/react/stage';

export function ThreadLinks() {
  const threads = useCommentThreads();
  const stage = useStage();

  return threads.map((thread) => (
    <button
      key={annotationKey(thread.root.ref)}
      onClick={() => stage.reveal(thread.page, { rect: thread.root.rect })}
    >
      {thread.root.contents}, page {thread.pageLabel}
    </button>
  ));
}
