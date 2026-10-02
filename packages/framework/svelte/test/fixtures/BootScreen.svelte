<!-- A loading screen that uses the kernel while the viewer starts. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { useKernel } from '../../src/runtime';

  let { statuses }: { statuses: string[] } = $props();

  const status = useKernel().status();
  untrack(() => statuses.push(status));
</script>

<div data-testid="boot">booting</div>
