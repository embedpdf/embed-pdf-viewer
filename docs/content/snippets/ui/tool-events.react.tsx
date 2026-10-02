import { useInteractionEvent } from '@embedpdf/react/interaction';
import { analytics } from './analytics';

export function ToolAnalytics() {
  useInteractionEvent(
    (interaction) => interaction.onToolChanged,
    ({ toolId }) => analytics.track('tool', { toolId }),
  );
  return null;
}
