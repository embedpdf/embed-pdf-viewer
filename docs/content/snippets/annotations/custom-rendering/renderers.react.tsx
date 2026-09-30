import { AnnotationLayer, type AnnotationRenderer } from '@embedpdf/react/annotation';
import { ApprovedBadge } from './approved-badge';

const renderers: AnnotationRenderer[] = [
  {
    for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
    component: ApprovedBadge,
  },
];

export const Annotations = () => <AnnotationLayer renderers={renderers} />;
