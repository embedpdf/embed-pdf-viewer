<!-- Bookmarks the reader adds: each one goes to the place in view when it's added. -->
<script lang="ts">
  import { useStageState } from '@embedpdf/svelte/stage';
  import { useOutline, useOutlineState, type OutlineItem } from '@embedpdf/svelte/outline';

  const outline = useOutline();
  const state = useOutlineState();
  const stage = useStageState();
  const selectedNumber = $derived(state.selected[0]?.objectNumber);

  function follow(item: OutlineItem) {
    outline.select([item.ref]);
    outline.activate(item.ref);
  }
</script>

<aside class="bookmarks">
  <header class="bookmarks-header">
    <h3 class="bookmarks-title">Bookmarks</h3>
    <button
      type="button"
      class="button primary"
      disabled={!state.canEdit}
      onclick={() =>
        outline.create({ title: `Page ${stage.currentPageIndex + 1}` }, { select: true })}
    >
      Add
    </button>
  </header>
  {#if state.rows.length === 0}
    <p class="empty">Scroll to a page, then add a bookmark.</p>
  {:else}
    <ul class="list">
      {#each state.rows as { item } (item.ref.objectNumber)}
        <li
          class="row"
          data-current={item.ref.objectNumber === state.current?.objectNumber || undefined}
          data-selected={item.ref.objectNumber === selectedNumber || undefined}
        >
          <button type="button" class="row-title" onclick={() => follow(item)}>{item.title}</button>
          <button
            type="button"
            class="row-delete"
            aria-label={`Delete ${item.title}`}
            disabled={!state.canEdit}
            onclick={() => outline.delete([item.ref])}
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</aside>
