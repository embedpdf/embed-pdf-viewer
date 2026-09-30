import type { AnnotationRendererProps } from '@embedpdf/react/annotation';

export function ApprovedBadge({ box, page, native, hovered }: AnnotationRendererProps) {
  const { x, y, width, height } = page.transform.pageToViewRect(box);
  return (
    <>
      {native}
      <div
        className={hovered ? 'badge badge--hover' : 'badge'}
        style={{ position: 'absolute', left: x + width - 12, top: y - 12 }}
      >
        ✓
      </div>
    </>
  );
}
