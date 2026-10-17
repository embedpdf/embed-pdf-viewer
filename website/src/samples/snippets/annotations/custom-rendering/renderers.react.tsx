import { AnnotationLayer, type AnnotationRenderer } from '@embedpdf/react/annotation';
import { CommentBubble } from './comment-bubble';

const renderers: AnnotationRenderer[] = [
  { for: (annotation) => annotation.subtype === 'text', component: CommentBubble },
];

export const Annotations = () => <AnnotationLayer renderers={renderers} />;
