<script lang="ts">
  import { useRedactionEvent } from '@embedpdf/svelte/redaction';

  let message = $state('');

  useRedactionEvent(
    (redaction) => redaction.onApplied,
    () => (message = 'Redacted: the content under the marks is gone'),
  );
</script>

<p aria-live="polite">{message}</p>
