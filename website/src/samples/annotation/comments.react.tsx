import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
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
import { localEngine } from '@embedpdf/engine';

import './comments.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const proposal = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/proposal.pdf');
  return { kind: 'bytes', id: 'proposal', bytes: new Uint8Array(await response.arrayBuffer()) };
};

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
      initialDocuments={[{ source: proposal }]}
    >
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="viewer">
          <Stage className="stage">
            {() => (
              <>
                <RenderLayer />
                <SelectionLayer />
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
