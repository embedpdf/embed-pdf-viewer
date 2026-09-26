/**
 * The signature plugin's UI intents → shell surfaces. The plugin owns the
 * act and says what happened; the chrome decides what opens:
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
  useSignatureEvent(
    (signature) => signature.onTargetChanged,
    (event) => {
      if (event.field) shell.open('signatures', { exclusive: 'right' });
    },
  );
  useSignatureEvent(
    (signature) => signature.onSignRequested,
    (event) =>
      shell.open('signature-sign', {
        exclusive: 'modal',
        props: { field: event.field, mark: event.mark },
      }),
  );
  useSignatureEvent(
    (signature) => signature.onInspectionRequested,
    (event) => shell.open('signature-inspector', { props: { field: event.field } }),
  );
  // The notice lives in the signatures panel; make sure it is seen.
  useSignatureEvent(
    (signature) => signature.onInvalidating,
    () => shell.open('signatures', { exclusive: 'right' }),
  );
  return null;
}
