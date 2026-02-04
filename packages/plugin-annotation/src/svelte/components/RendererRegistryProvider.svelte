<script lang="ts">
  import { provideRendererRegistry } from '../context';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  provideRendererRegistry();
</script>

{@render children()}
