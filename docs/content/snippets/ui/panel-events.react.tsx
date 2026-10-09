import { useShellEvent } from '@embedpdf/react/shell';
import { analytics } from './analytics';

export function PanelAnalytics() {
  useShellEvent(
    (shell) => shell.onSurfaceOpened,
    ({ id }) => analytics.track('panel', { id }),
  );
  return null;
}
