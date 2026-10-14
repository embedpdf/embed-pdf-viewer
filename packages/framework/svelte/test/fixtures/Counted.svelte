<!-- Records each time it's created. -->
<script lang="ts">
  import { untrack } from 'svelte';

  let { renders }: { renders: unknown[] } = $props();
  untrack(() => renders.push('created'));
</script>
