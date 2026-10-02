import { useSelectionState } from '@embedpdf/react/selection';

export function HighlightButton() {
  const { hasSelection, isSelecting, pages } = useSelectionState();

  return <button disabled={!hasSelection}>Highlight</button>;
}
