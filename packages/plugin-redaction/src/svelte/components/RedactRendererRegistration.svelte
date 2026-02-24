<script lang="ts">
  import { onMount } from 'svelte';
  import { getRendererRegistry } from '@embedpdf/plugin-annotation/svelte';
  import { redactRenderers } from './redact-renderers';
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();

  const registry = getRendererRegistry();

  onMount(() => {
    if (!registry) return;
    return registry.register(redactRenderers);
  });
</script>

{#if children}
  {@render children()}
{/if}
