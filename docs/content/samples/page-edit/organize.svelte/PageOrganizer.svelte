<!-- Every page as a card. Click cards to select them; the toolbar edits every selected page at once. -->
<script lang="ts">
  import { usePageList, type PageRef } from '@embedpdf/svelte/runtime';
  import { usePageEdit } from '@embedpdf/svelte/page-edit';
  import { PageView } from '@embedpdf/svelte/page-view';
  import { RenderLayer } from '@embedpdf/svelte/render';

  const sameRef = (left: PageRef, right: PageRef) => left.objectNumber === right.objectNumber;

  const pageEdit = usePageEdit();
  const pages = usePageList();
  const canEdit = $derived(pageEdit.canEdit());
  // The second and third pages start selected. Refs, not indexes: they still name the
  // same pages after a reorder.
  let selected = $state.raw(pages.current.slice(1, 3).map((page) => page.ref));

  const isSelected = (page: PageRef) => selected.some((ref) => sameRef(ref, page));
  const toggle = (page: PageRef) => {
    selected = isSelected(page)
      ? selected.filter((ref) => !sameRef(ref, page))
      : [...selected, page];
  };
  const count = $derived(selected.length);

  async function remove() {
    await pageEdit.delete(selected);
    selected = [];
  }
</script>

<div class="toolbar">
  <output class="readout">
    {count} of {pages.current.length} selected
  </output>
  <span class="spacer"></span>
  <button
    type="button"
    class="button"
    disabled={!canEdit || count === 0}
    onclick={() => pageEdit.rotateBy(selected, -90)}
  >
    ⟲ Rotate left
  </button>
  <button
    type="button"
    class="button"
    disabled={!canEdit || count === 0}
    onclick={() => pageEdit.rotateBy(selected, 90)}
  >
    ⟳ Rotate right
  </button>
  <button
    type="button"
    class="button"
    disabled={!canEdit || count === 0}
    onclick={() => pageEdit.reorder(selected, 'start')}
  >
    Move to front
  </button>
  <!-- A document keeps at least one page. -->
  <button
    type="button"
    class="button danger"
    disabled={!canEdit || count === 0 || count === pages.current.length}
    onclick={remove}
  >
    Delete
  </button>
</div>
<ol class="pages">
  {#each pages.current as page (page.ref.objectNumber)}
    <li>
      <button
        type="button"
        class="card"
        aria-pressed={isSelected(page.ref)}
        onclick={() => toggle(page.ref)}
      >
        <PageView page={page.ref} width={120} class="thumbnail">
          <RenderLayer />
        </PageView>
        <span class="label">
          Page {page.index + 1}
          {#if page.rotation !== 0}
            <span class="turn"> · {page.rotation}°</span>
          {/if}
        </span>
      </button>
    </li>
  {/each}
</ol>
