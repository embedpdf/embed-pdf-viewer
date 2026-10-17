import { useInteraction } from '@embedpdf/react/interaction';

export function MeasureButton() {
  const interaction = useInteraction();

  return <button onClick={() => interaction.activateTool('distance')}>Measure</button>;
}
