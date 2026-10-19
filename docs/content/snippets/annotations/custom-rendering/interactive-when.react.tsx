import { AnnotationLayer, type AnnotationRenderer } from '@embedpdf/react/annotation';
import { ApprovalWidget } from './approval-widget';

const renderers: AnnotationRenderer[] = [
  {
    for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
    component: ApprovalWidget,
    interactive: ({ toolId }) => toolId === 'pan', // interactive in reading mode only
  },
];

export const Annotations = () => <AnnotationLayer renderers={renderers} />;
