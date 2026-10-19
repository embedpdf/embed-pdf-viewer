import { useSurface } from '@embedpdf/react/shell';
import { CommentList } from './comment-list';

export function CommentsPanel() {
  const { props } = useSurface('comments'); // { focus: … }
  return <CommentList focus={props.focus} />;
}
