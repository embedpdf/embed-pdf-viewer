<script setup lang="ts">
import { useActionsEvent } from '@embedpdf/vue/actions';

useActionsEvent(
  (actions) => actions.onDiagnosticReported,
  ({ code, action }) => console.warn(`Action ${action} was not run: ${code}`),
);
</script>
