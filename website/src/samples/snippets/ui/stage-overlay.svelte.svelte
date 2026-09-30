<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import type { SearchHit } from '@embedpdf/svelte/search';
  import { Stage } from '@embedpdf/svelte/stage';
  import { highlight } from './highlight';

  let { hit }: { hit: SearchHit } = $props();
</script>

<Stage>
  {#snippet page()}
    <RenderLayer />
  {/snippet}
  {#snippet overlay()}
    <Anchored anchor={{ page: hit.page, bounds: hit.bounds }} placement="bottom">
      <button onclick={() => highlight(hit)}>Highlight</button>
    </Anchored>
  {/snippet}
</Stage>
