import { annotationKey, useCommentThreads } from '@embedpdf/react/annotation';

export function Comments() {
  const threads = useCommentThreads();

  return threads.map((thread) => (
    <article key={annotationKey(thread.root.ref)}>
      <p>
        {thread.root.author}, page {thread.pageLabel}: {thread.root.contents}
      </p>
      {thread.replies.map((reply) => (
        <p key={annotationKey(reply.ref)}>
          {reply.author}: {reply.contents}
        </p>
      ))}
    </article>
  ));
}
