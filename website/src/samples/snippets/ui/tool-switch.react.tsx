import { useInteraction, useInteractionState } from '@embedpdf/react/interaction';

export function ToolSwitch() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();

  return (
    <>
      <button aria-pressed={activeToolId === 'pointer'} onClick={() => interaction.activateTool('pointer')}>
        Select
      </button>
      <button aria-pressed={activeToolId === 'pan'} onClick={() => interaction.activateTool('pan')}>
        Hand
      </button>
    </>
  );
}
