import {
  AnnotationLayer,
  annotationKey,
  type AnnotationRenderer,
  type AnnotationRendererProps,
} from '@embedpdf/react/annotation';
import { StatusDot, useApproval } from './approvals'; // your own data and UI

const renderers: AnnotationRenderer[] = [
  {
    for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
    component: ApprovalStamp,
    interactive: ({ toolId }) => toolId === 'pan',
  },
];

function ApprovalStamp({ annotation, box, page, native, interactive }: AnnotationRendererProps) {
  const approval = useApproval(annotationKey(annotation.ref)); // your own data
  const { x, y, width, height } = page.transform.pageToViewRect(box);

  return (
    <>
      {native}
      <div style={{ position: 'absolute', left: x, top: y, width, height }}>
        <StatusDot status={approval.status} />
        {interactive && <button onClick={approval.open}>Details</button>}
      </div>
    </>
  );
}

export const Annotations = () => <AnnotationLayer renderers={renderers} />;
