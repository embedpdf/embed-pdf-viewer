import type { AnnotationRendererProps } from '@embedpdf/react/annotation';

export function Pin({ box, page }: AnnotationRendererProps) {
  // page coordinates → this page's pixels, zoom and rotation included
  const { x, y } = page.transform.pageToView({ x: box.x, y: box.y });

  return <div style={{ position: 'absolute', left: x, top: y }}>📌</div>;
}
