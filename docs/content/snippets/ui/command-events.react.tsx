import { useCommandsEvent } from '@embedpdf/react/commands';
import { analytics } from './analytics';

export function CommandAnalytics() {
  useCommandsEvent(
    (commands) => commands.onExecuted,
    ({ commandId }) => analytics.track('command', { commandId }),
  );
  return null;
}
