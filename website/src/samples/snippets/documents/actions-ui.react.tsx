import { useActionsUiAdapter } from '@embedpdf/react/actions';
import { toast } from './toast';

export function ViewerShell() {
  useActionsUiAdapter({
    openUri: (uri) => {
      if (confirm(`Open ${uri}?`)) window.open(uri, '_blank', 'noopener');
    },
    alert: (message) => toast(message),
  });
  return <>{/* your viewer */}</>;
}
