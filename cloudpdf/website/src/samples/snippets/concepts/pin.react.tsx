import type { AnnotationRendererProps } from '@embedpdf/react/annotation';

export function Pin({ box, page }: AnnotationRendererProps) {
  // page coordinates → pixels on this page, at its zoom; the page turns them with it
  const { x, y } = page.transform.toPixels({ x: box.x, y: box.y });

  return <div style={{ position: 'absolute', left: x, top: y }}>📌</div>;
}
