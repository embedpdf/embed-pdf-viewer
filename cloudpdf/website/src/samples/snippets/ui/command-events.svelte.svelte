<script lang="ts">
  import { useCommandsEvent } from '@embedpdf/svelte/commands';
  import { analytics } from './analytics';

  useCommandsEvent(
    (commands) => commands.onExecuted,
    ({ commandId }) => analytics.track('command', { commandId }),
  );
</script>

<!-- your toolbar and pages -->
