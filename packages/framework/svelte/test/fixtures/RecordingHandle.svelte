<!-- A handle of yours, drawn by the layer's `handle` snippet: it records the props it gets. -->
<script lang="ts">
  import type { HandleProps } from '../../src/annotation';
  import { annotationRecords } from './annotation-records';

  let { handle }: { handle: HandleProps } = $props();

  $effect(() => {
    annotationRecords.handles.push(handle);
  });
</script>

<i data-testid="handle"></i>
