<!-- The panel shows the match its props name, and steps to the next one without reopening. -->
<script lang="ts">
  import { useSearch, useSearchHits } from '@embedpdf/svelte/search';
  import { useShell, useSurface } from '@embedpdf/svelte/shell';

  const panel = useSurface('match');
  const shell = useShell();
  const search = useSearch();
  const hits = useSearchHits();
  const index = $derived(typeof panel.props.index === 'number' ? panel.props.index : 0);
  const hit = $derived(hits.current[index]);

  function show(next: number) {
    shell.updateSurfaceProps('match', { index: next });
    search.goToHit(hits.current[next]);
  }
</script>

{#if panel.isOpen}
  <aside class="panel" aria-label="Match">
    <header class="panel-header">
      <h3 class="panel-title">Match {index + 1} of {hits.current.length}</h3>
      <button type="button" class="close" aria-label="Close" onclick={panel.close}>×</button>
    </header>
    {#if hit}
      <p class="page">Page {hit.pageIndex + 1}</p>
      {#if hit.snippet}
        <p class="snippet">
          …{hit.snippet.before}<mark>{hit.snippet.match}</mark>{hit.snippet.after}…
        </p>
      {/if}
    {:else}
      <p class="page">Searching…</p>
    {/if}
    <div class="steps">
      <button type="button" class="button" disabled={index === 0} onclick={() => show(index - 1)}>
        ← Previous
      </button>
      <button
        type="button"
        class="button"
        disabled={index >= hits.current.length - 1}
        onclick={() => show(index + 1)}
      >
        Next →
      </button>
    </div>
  </aside>
{/if}
