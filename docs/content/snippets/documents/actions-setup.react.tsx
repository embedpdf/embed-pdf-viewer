import { actionsPlugin, useActionsUiAdapter } from '@embedpdf/react/actions';

export const plugins = [/* … */ actionsPlugin()];

export function ViewerShell() {
  useActionsUiAdapter();
  return <>{/* your viewer */}</>;
}
