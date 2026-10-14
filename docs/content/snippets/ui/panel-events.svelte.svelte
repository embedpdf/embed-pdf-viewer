<script lang="ts">
  import { useShellEvent } from '@embedpdf/svelte/shell';
  import { analytics } from './analytics';

  useShellEvent(
    (shell) => shell.onSurfaceOpened,
    ({ id }) => analytics.track('panel', { id }),
  );
</script>

<!-- your toolbar, panels and pages -->
