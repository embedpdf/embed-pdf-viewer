import { useAnnotationList } from '@embedpdf/react/annotation';

export function HighlightCount() {
  const highlights = useAnnotationList({ subtype: 'highlight' });

  return <p>{highlights.length} highlights</p>;
}
