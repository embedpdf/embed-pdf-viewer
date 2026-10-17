import { Anchored } from '@embedpdf/react/anchored';
import {
  AnnotationLayer,
  useAnnotationAnchor,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { Stage } from '@embedpdf/react/stage';

function StampCard() {
  const { hovered } = useAnnotationState(); // the annotation under the pointer, or null
  const anchor = useAnnotationAnchor(hovered?.ref ?? null);

  if (hovered?.subtype !== 'stamp') return null;
  return (
    <Anchored anchor={anchor} placement="top">
      <div className="card">Approved by {hovered.author}</div>
    </Anchored>
  );
}

export const Pages = () => <Stage overlay={<StampCard />}>{() => <AnnotationLayer />}</Stage>;
