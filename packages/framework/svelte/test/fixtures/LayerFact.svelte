<!-- Publishes one page-layer fact while it's mounted. -->
<script lang="ts" generics="Key extends keyof PageLayerFacts">
  import { untrack } from 'svelte';
  import { usePageLayerFact, type PageLayerFacts } from '../../src/runtime/dev-registry.svelte';

  let { page, fact, value }: { page: object; fact: Key; value: PageLayerFacts[Key] } = $props();

  // The page and the fact are the layer's own for its lifetime; the value may change.
  untrack(() => usePageLayerFact(page, fact, () => value));
</script>
