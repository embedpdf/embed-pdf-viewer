import { Anchored } from '@embedpdf/react/anchored';
import { annotationKey, useAnnotationAnchor, type Annotation } from '@embedpdf/react/annotation';
import { useApproval } from './approvals'; // your own data

// Pinned under the stamp: it stays there while the stamp moves, and scrolls away with it.
export function ApprovalStatus({ stamp }: { stamp: Annotation }) {
  const anchor = useAnnotationAnchor(stamp.ref);
  const approval = useApproval(annotationKey(stamp.ref)); // your own data

  return (
    <Anchored anchor={anchor} placement="bottom" pinned>
      <div className="status">
        {approval.signedOff ? 'Signed off' : 'Waiting'}
        <button onClick={approval.toggle}>{approval.signedOff ? 'Undo' : 'Sign off'}</button>
      </div>
    </Anchored>
  );
}
