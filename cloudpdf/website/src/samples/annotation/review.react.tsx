import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationKey,
  annotationPlugin,
  useAnnotation,
  useAnnotationState,
  useComments,
  useCommentThreads,
  type CommentThreadView,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './review.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// On load: two notes on the cover, one already accepted.
function AddNotes() {
  const annotation = useAnnotation();
  const comments = useComments();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void annotation.create(cover, {
      subtype: 'text',
      rect: { x: 470, y: 232, width: 20, height: 20 },
      contents: 'Can we shorten the title?',
      color: '#facc15',
    });
    void annotation
      .create(cover, {
        subtype: 'text',
        rect: { x: 280, y: 520, width: 20, height: 20 },
        contents: 'Add the co-author',
        color: '#facc15',
      })
      .then(({ annotation: note }) => comments.setStatus(note.ref, 'accepted'));
  }, [annotation, comments, ready, cover]);

  return null;
}

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
      initialDocuments={[{ source: ebook }]}
    >
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddNotes />
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer annotations={false} />
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
