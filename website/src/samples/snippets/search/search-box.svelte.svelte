<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { SearchLayer, useSearch, useSearchState } from '@embedpdf/svelte/search';
  import { Stage } from '@embedpdf/svelte/stage';

  const search = useSearch();
  const state = useSearchState();
</script>

<form onsubmit={(event) => event.preventDefault()}>
  <input oninput={(event) => search.search({ text: event.currentTarget.value })} />
  {#if state.status === 'searching'}
    <span>Searching…</span>
  {/if}
  {#if state.hitCount > 0}
    <span>{state.activeHitIndex + 1} of {state.hitCount}</span>
  {/if}
  <button type="button" onclick={() => search.previousHit()}>↑</button>
  <button type="button" onclick={() => search.nextHit()}>↓</button>
</form>

<Stage>
  <RenderLayer />
  <SearchLayer />
</Stage>
