<script lang="ts">
  import { onMount } from 'svelte';
  import { getRendererRegistry } from '@embedpdf/plugin-annotation/svelte';
  import { formRenderers } from './form-renderers';

  const registry = getRendererRegistry();

  onMount(() => {
    if (!registry) return;
    return registry.register(formRenderers);
  });
</script>
