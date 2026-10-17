import { useAnnotationState } from '@embedpdf/react/annotation';

export function SelectionCount() {
  const { selected } = useAnnotationState(); // the selected annotations

  return <p>{selected.length} selected</p>;
}
