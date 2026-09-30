<script lang="ts">
  import { useActionsEvent } from '@embedpdf/svelte/actions';

  useActionsEvent(
    (actions) => actions.onDiagnosticReported,
    ({ code, action }) => console.warn(`Action ${action} was not run: ${code}`),
  );
</script>
