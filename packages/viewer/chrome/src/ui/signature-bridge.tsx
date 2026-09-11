/**
 * The signature plugin's UI intents → shell surfaces. The plugin owns the
 * act and says WHAT happened; the chrome decides WHAT OPENS:
 *
 *   target  (a "sign here" click)      → the signatures panel, right side
 *   ask     (mode 'ask' met a field)   → the sign dialog (modal)
 *   inspect (a signed field clicked)   → the validation popover
 *
 * Mounted once per document view; renders nothing.
 */
import { useSignatureEvent } from '@embedpdf/react/signature';
import { useShell } from '@embedpdf/react/shell';

export function SignatureBridge() {
  const shell = useShell();
  useSignatureEvent((event) => {
    switch (event.type) {
      case 'target':
        if (event.field) shell.open('signatures', { exclusive: 'right' });
        return;
      case 'ask':
        shell.open('signature-sign', {
          exclusive: 'modal',
          props: { field: event.field, mark: event.mark },
        });
        return;
      case 'inspect':
        shell.open('signature-inspector', { props: { field: event.field } });
        return;
      default:
        return;
    }
  });
  return null;
}
