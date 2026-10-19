<!--
  A custom item the toolbar can't measure in its measurement layer: once it's drawn, it says it's
  500px long. `wide.mounts` counts the times it was drawn.
-->
<script lang="ts" module>
  export const wide = { mounts: 0 };
</script>

<script lang="ts">
  import { untrack } from 'svelte';

  let { measure }: { measure: (length: number) => void } = $props();

  wide.mounts += 1;
  $effect(() => untrack(() => measure(500)));
</script>

<span class="wide">Wide</span>
