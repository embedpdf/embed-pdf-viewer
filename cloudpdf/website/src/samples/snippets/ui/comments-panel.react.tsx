import { useSurface } from '@embedpdf/react/shell';
import { CommentList } from './comment-list';

export function CommentsPanel() {
  const panel = useSurface('comments');
  if (!panel.isOpen) return null;

  return (
    <aside>
      <button onClick={panel.close}>Close</button>
      <CommentList />
    </aside>
  );
}

export function CommentsButton() {
  const panel = useSurface('comments');
  return <button onClick={() => panel.toggle({ exclusive: 'right' })}>Comments</button>;
}
