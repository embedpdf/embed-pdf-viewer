/**
 * The angle a selection is being turned to, beside the pointer:
 *
 *   <AnnotationRotationBadge>   solves where (the pointer, upright on any
 *                               page rotation: it floats over the page)
 *   this file                   is the look
 *
 * Mounted in the Stage `overlay` slot; it shows only while a rotation runs.
 */
import { AnnotationRotationBadge } from '@embedpdf/react/annotation-menu';

export function RotationBadge() {
  return (
    <AnnotationRotationBadge>
      {({ angle }) => (
        <div className="pointer-events-none whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 font-mono text-xs text-white">
          {angle}°
        </div>
      )}
    </AnnotationRotationBadge>
  );
}
