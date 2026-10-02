import { useActionsEvent } from '@embedpdf/react/actions';

export function ActionDiagnostics() {
  useActionsEvent(
    (actions) => actions.onDiagnosticReported,
    ({ code, action }) => console.warn(`Action ${action} was not run: ${code}`),
  );

  return null;
}
