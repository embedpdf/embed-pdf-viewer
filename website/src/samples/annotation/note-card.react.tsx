import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  AnnotationMenu,
  annotationKey,
  annotationPlugin,
  useAnnotation,
  useAnnotationState,
  useCommentThread,
  useComments,
} from '@embedpdf/react/annotation';
import { localEngine } from '@embedpdf/engine';

import './note-card.css';

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

// The clicked annotation's comment and its replies, in your own card next to it: a note, or any
// mark that carries a comment, such as a highlight. It shows while the annotation is selected.
function NoteCard() {
  const annotation = useAnnotation();
  const comments = useComments();
  const { selected } = useAnnotationState();
  const thread = useCommentThread(selected.length === 1 ? selected[0]!.ref : null);
  const [reply, setReply] = useState('');

  // Escape closes the card, as it ends the selection.
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') annotation.selection.clear();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [annotation]);

  if (!thread?.root.contents) return null; // no comment to read

  return (
    <AnnotationMenu placement="right">
      <article className="note-card">
        <p className="comment">
          <strong>{thread.root.author}</strong> {thread.root.contents}
        </p>
        {thread.replies.map((each) => (
          <p key={annotationKey(each.ref)} className="comment reply">
            <strong>{each.author}</strong> {each.contents}
          </p>
        ))}
        {comments.canReply(thread.root.ref) && (
          <form
            className="reply-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!reply.trim()) return;
              void comments.reply(thread.root.ref, reply.trim());
              setReply('');
            }}
          >
            <input
              className="field"
              aria-label="Reply"
              placeholder="Reply…"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
            />
          </form>
        )}
      </article>
    </AnnotationMenu>
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
        <p className="hint">Click the note next to the title, or the highlighted sentence</p>
        <Stage className="stage" overlay={<NoteCard />}>
          {() => (
            <>
              <RenderLayer />
              <SelectionLayer />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
