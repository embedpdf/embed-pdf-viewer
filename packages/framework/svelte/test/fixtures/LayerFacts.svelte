<!-- Several page-layer facts at once. -->
<script lang="ts">
  import type { PageLayerFacts } from '../../src/runtime/dev-registry.svelte';
  import LayerFact from './LayerFact.svelte';

  let {
    facts,
  }: {
    facts: {
      page: object;
      fact: keyof PageLayerFacts;
      value: PageLayerFacts[keyof PageLayerFacts];
    }[];
  } = $props();
</script>

{#each facts as entry, index (index)}
  <LayerFact page={entry.page} fact={entry.fact} value={entry.value} />
{/each}
