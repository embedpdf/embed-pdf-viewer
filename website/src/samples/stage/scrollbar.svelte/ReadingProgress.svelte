<!-- A reading-progress bar, from the same numbers a scrollbar uses. -->
<script lang="ts">
  import { useScrollMetrics } from '@embedpdf/svelte/stage';

  const metrics = useScrollMetrics();
  const travel = $derived(metrics.scrollHeight - metrics.clientHeight);
  const progress = $derived(travel > 0 ? Math.round((metrics.scrollTop / travel) * 100) : 0);
</script>

<div class="progress" role="progressbar" aria-label="Reading progress" aria-valuenow={progress}>
  <div class="progress-fill" style:width="{progress}%"></div>
</div>
