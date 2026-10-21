import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationKey,
  annotationPlugin,
  useComments,
  useCommentThreads,
  type CommentThreadView,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './review.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// A thread's verdict, its check mark, and the buttons the user may use.
function Review({ thread }: { thread: CommentThreadView }) {
  const comments = useComments();
  const ref = thread.root.ref;
  const verdict = thread.review.lastChange?.state ?? 'none';
  const marked = thread.review.markedBy.length > 0;

  return (
    <article className="thread">
      <p className="comment">
        <strong>{thread.root.author}</strong> {thread.root.contents}
      </p>
      <p className="verdict">
        <span className={`state state--${verdict}`}>{verdict}</span>
        {marked && <span className="mark">✓ checked off</span>}
      </p>
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={!comments.canSetStatus(ref)}
          onClick={() => comments.setStatus(ref, 'accepted')}
        >
          Accept
        </button>
        <button
          type="button"
          className="button"
          disabled={!comments.canSetStatus(ref)}
          onClick={() => comments.setStatus(ref, 'rejected')}
        >
          Reject
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={marked}
          disabled={!comments.canSetMarked(ref)}
          onClick={() => comments.setMarked(ref, !marked)}
        >
          ✓
        </button>
        <button
          type="button"
          className="button"
          disabled={!comments.canDeleteThread(ref)}
          onClick={() => comments.deleteThread(ref)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function Reviews() {
  const threads = useCommentThreads();

  return (
    <div className="panel threads">
      {threads.length === 0 && <p className="empty">No comments</p>}
      {threads.map((thread) => (
        <Review key={annotationKey(thread.root.ref)} thread={thread} />
      ))}
    </div>
  );
}

export default function App() {
  return (
    <Viewer
      engine={engine}
      plugins={plugins}
      identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
      initialDocuments={[{ source: review }]}
    >
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <AnnotationLayer />
              </>
            )}
          </Stage>
          <Reviews />
        </div>
      </DocumentGate>
    </Viewer>
  );
}
