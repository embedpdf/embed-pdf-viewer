import { copySelection, useSelection, useSelectionState } from '@embedpdf/react/selection';

export function CopyButton() {
  const selection = useSelection();
  const { hasSelection } = useSelectionState();

  return (
    <button disabled={!hasSelection || !selection.canCopy()} onClick={() => copySelection(selection)}>
      Copy
    </button>
  );
}
