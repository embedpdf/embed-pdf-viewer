import { AnnotationLayer, type AnnotationRenderer } from '@embedpdf/react/annotation';
import { ApprovalWidget } from './approval-widget';

const renderers: AnnotationRenderer[] = [
  {
    for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
    component: ApprovalWidget,
    interactive: true,
  },
];

export const Annotations = () => <AnnotationLayer renderers={renderers} />;
