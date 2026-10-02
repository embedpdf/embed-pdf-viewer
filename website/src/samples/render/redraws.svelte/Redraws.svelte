<script lang="ts">
  import { onMount } from 'svelte';
  import { useRender, useRenderEvent } from '@embedpdf/svelte/render';
  import { useStageState } from '@embedpdf/svelte/stage';

  interface Entry {
    id: number;
    text: string;
  }

  const render = useRender();
  const currentPage = useStageState((state) => state.currentPage);
  let entries = $state<Entry[]>([]);
  let count = 0;

  useRenderEvent(
    (render) => render.onInvalidated,
    ({ pages, scope, origin }) => {
      const what = `${pages.length === 1 ? '1 page' : `${pages.length} pages`} · ${scope}`;
      const from = origin ? `an edit (${origin.kind})` : 'your code';
      entries = [{ id: count++, text: `${what} · from ${from}` }, ...entries].slice(0, 4);
    },
  );

  // Redraw the first page on load, so there's something in the list.
  onMount(() => {
    render.invalidate({ pages: [0] });
  });

  // Changes whenever this page's pixels do: key your own long-lived renders on it.
  const epoch = $derived(currentPage.current ? render.getRenderEpoch(currentPage.current) : 0);
</script>

<div class="panel">
  <div class="toolbar">
    <button
      type="button"
      class="button"
      disabled={!currentPage.current}
      onclick={() => currentPage.current && render.invalidate({ pages: [currentPage.current] })}
    >
      Redraw this page
    </button>
    <button
      type="button"
      class="button"
      disabled={!currentPage.current}
      onclick={() =>
        currentPage.current &&
        render.invalidate({ pages: [currentPage.current], scope: 'annotations' })}
    >
      Only its annotations
    </button>
    <output class="badge">
      render epoch <strong>{epoch}</strong>
    </output>
  </div>
  <ol class="log" aria-live="polite">
    {#each entries as entry (entry.id)}
      <li class="entry">
        <code>onInvalidated</code>
        {entry.text}
      </li>
    {/each}
  </ol>
</div>
