<script lang="ts">
  import { useInteractionEvent } from '@embedpdf/svelte/interaction';
  import { analytics } from './analytics';

  useInteractionEvent(
    (interaction) => interaction.onToolChanged,
    ({ toolId }) => analytics.track('tool', { toolId }),
  );
</script>

<!-- your toolbar and pages -->
