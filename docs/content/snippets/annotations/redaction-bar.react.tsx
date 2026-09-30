import { useInteraction } from '@embedpdf/react/interaction';
import { useRedaction, useRedactionState } from '@embedpdf/react/redaction';

export function RedactBar() {
  const interaction = useInteraction();
  const redaction = useRedaction();
  const { pendingCount, applying } = useRedactionState();

  return (
    <>
      <button onClick={() => interaction.activateTool('redact')}>Mark for redaction</button>
      <button disabled={!pendingCount || applying} onClick={() => redaction.applyAll()}>
        Redact {pendingCount} marks
      </button>
    </>
  );
}
