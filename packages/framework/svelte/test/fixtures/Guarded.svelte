<!-- `content` inside a boundary, for a reader that throws while it's created. -->
<script lang="ts">
  import type { Component } from 'svelte';
  import Boundary from './Boundary.svelte';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { content, props = {} }: { content: Component<any>; props?: Record<string, unknown> } =
    $props();
  const Content = $derived(content);
</script>

<Boundary><Content {...props} /></Boundary>
