import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
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

import './comments.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// On load: a note with two replies on the cover, and a highlight with a comment on page 2.
function AddComments() {
  const annotation = useAnnotation();
  const comments = useComments();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const [cover, second] = usePageList();
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || !second || added.current) return;
    added.current = true;
    void annotation
      .create(cover.ref, {
        subtype: 'text',
        rect: { x: 470, y: 232, width: 20, height: 20 },
        contents: 'Can we shorten the title?',
        color: '#facc15',
      })
      .then(async ({ annotation: note }) => {
        await comments.reply(note.ref, 'Maybe drop "(But they Don’t Have to Be)".');
        await comments.reply(note.ref, 'I like it long. It’s a promise.');
      });
    void annotation.create(second.ref, {
      subtype: 'highlight',
      quadPoints: [
        {
          upperLeft: { x: 57, y: 57 },
          upperRight: { x: 322, y: 57 },
          lowerLeft: { x: 57, y: 129 },
          lowerRight: { x: 322, y: 129 },
        },
      ],
      color: '#ffcd45',
      contents: 'A strong opening.',
    });
  }, [annotation, comments, ready, cover, second]);

  return null;
}

// One thread: the first comment, its replies, a reply box, and a button that shows it.
function Thread({ thread }: { thread: CommentThreadView }) {
  const comments = useComments();
  const annotation = useAnnotation();
  const stage = useStage();
  const [text, setText] = useState('');

  function show() {
    stage.reveal(thread.page, { rect: thread.root.rect });
    annotation.selection.set([thread.root.ref]); // and select it
  }

  return (
    <article className="thread">
      <header className="thread-head">
        <span className="where">Page {thread.pageLabel}</span>
        <button type="button" className="show" onClick={show}>
          Show
        </button>
      </header>
      <p className="comment">
        <strong>{thread.root.author}</strong> {thread.root.contents}
      </p>
      {thread.replies.map((reply) => (
        <p key={annotationKey(reply.ref)} className="comment reply">
          <strong>{reply.author}</strong> {reply.contents}
        </p>
      ))}
      {comments.canReply(thread.root.ref) && (
        <form
          className="reply-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) return;
            void comments.reply(thread.root.ref, text.trim());
            setText('');
          }}
        >
          <input
            className="field"
            aria-label="Reply"
            placeholder="Reply…"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </form>
      )}
    </article>
  );
}

// Every thread in the document, in reading order.
function Comments() {
  const threads = useCommentThreads();
  const loading = useAnnotationState((state) => state.status === 'loading');

  return (
    <div className="panel threads">
      {loading && <p className="empty">Loading comments…</p>}
      {!loading && threads.length === 0 && <p className="empty">No comments</p>}
      {threads.map((thread) => (
        <Thread key={annotationKey(thread.root.ref)} thread={thread} />
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
        <AddComments />
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <AnnotationLayer />
              </>
            )}
          </Stage>
          <Comments />
        </div>
      </DocumentGate>
    </Viewer>
  );
}
