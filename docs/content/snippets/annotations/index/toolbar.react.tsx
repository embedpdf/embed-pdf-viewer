import { useInteraction, useInteractionState } from '@embedpdf/react/interaction';

export function Toolbar() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();

  return ['pointer', 'square', 'ink', 'highlight', 'note'].map((id) => (
    <button key={id} aria-pressed={activeToolId === id} onClick={() => interaction.activateTool(id)}>
      {id}
    </button>
  ));
}
