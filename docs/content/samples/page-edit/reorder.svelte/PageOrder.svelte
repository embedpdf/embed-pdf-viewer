<!-- Pick a page, then move it. Each button uses another placement. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { usePageEdit } from '@embedpdf/svelte/page-edit';
  import { PageView } from '@embedpdf/svelte/page-view';
  import { RenderLayer } from '@embedpdf/svelte/render';

  const pageEdit = usePageEdit();
  const pages = usePageList();
  // The last page starts selected. Its ref names it wherever it moves.
  let selected = $state.raw(pages.current[pages.current.length - 1]?.ref ?? null);

  const page = $derived(
    pages.current.find((each) => each.ref.objectNumber === selected?.objectNumber),
  );
  const before = $derived(page && pages.current[page.index - 1]);
  const after = $derived(page && pages.current[page.index + 1]);
  const canEdit = $derived(pageEdit.canEdit());
</script>

<div class="toolbar">
  <output class="readout">
    {page ? `Page ${page.index + 1} selected` : 'Pick a page'}
  </output>
  <span class="spacer"></span>
  <button
    type="button"
    class="button"
    disabled={!canEdit || !before}
    onclick={() => page && pageEdit.reorder([page.ref], 'start')}
  >
    ⇤ To the front
  </button>
  <button
    type="button"
    class="button"
    disabled={!canEdit || !before}
    onclick={() => page && before && pageEdit.reorder([page.ref], { before: before.ref })}
  >
    ← Earlier
  </button>
  <button
    type="button"
    class="button"
    disabled={!canEdit || !after}
    onclick={() => page && after && pageEdit.reorder([page.ref], { after: after.ref })}
  >
    Later →
  </button>
  <button
    type="button"
    class="button"
    disabled={!canEdit || !after}
    onclick={() => page && pageEdit.reorder([page.ref], 'end')}
  >
    To the back ⇥
  </button>
</div>
<ol class="strip">
  {#each pages.current as each (each.ref.objectNumber)}
    <li>
      <button
        type="button"
        class="card"
        aria-pressed={each.ref.objectNumber === selected?.objectNumber}
        onclick={() => (selected = each.ref)}
      >
        <PageView page={each.ref} width={110} class="thumbnail">
          <RenderLayer />
        </PageView>
        <span class="label">{each.index + 1}</span>
      </button>
    </li>
  {/each}
</ol>
