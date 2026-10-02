import { useAnnotation, type CommentThread } from '@embedpdf/react/annotation';
import { useStage } from '@embedpdf/react/stage';

export function ShowButton({ thread }: { thread: CommentThread }) {
  const stage = useStage();
  const annotation = useAnnotation();

  function show() {
    stage.reveal(thread.page, { rect: thread.root.rect });
    annotation.selection.set([thread.root.ref]); // and select it
  }

  return <button onClick={show}>Show</button>;
}
