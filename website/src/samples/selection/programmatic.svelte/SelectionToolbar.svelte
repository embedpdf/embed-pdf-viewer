<!-- Every button selects on the cover, the first page: by its ref, or by its index, 0. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useSelection, useSelectionState } from '@embedpdf/svelte/selection';

  // On the cover: the characters of its title, and a point on its word "Viewers", in page coordinates.
  const TITLE = { start: 10, count: 52 };
  const POINT = { x: 260, y: 242 };

  const selection = useSelection();
  const state = useSelectionState();
  const pages = usePageList();
  const cover = $derived(pages.current[0]?.ref);

  // The title is selected on load.
  $effect(() => {
    if (cover) selection.select({ page: cover, ...TITLE });
  });

  const summary = $derived.by(() => {
    if (state.pages.length > 1) return `On ${state.pages.length} pages`;
    if (state.range) return `${state.range.end.index - state.range.start.index} characters`;
    return 'Nothing selected';
  });
</script>

<div class="toolbar">
  <button
    type="button"
    class="button"
    disabled={!selection.canSelect() || !cover}
    onclick={() => cover && selection.select({ page: cover, ...TITLE })}
  >
    Title
  </button>
  <button
    type="button"
    class="button"
    disabled={!selection.canSelect()}
    onclick={() => selection.selectWordAt(0, POINT)}
  >
    Word
  </button>
  <button
    type="button"
    class="button"
    disabled={!selection.canSelect()}
    onclick={() => selection.selectLineAt(0, POINT)}
  >
    Line
  </button>
  <button
    type="button"
    class="button"
    disabled={!selection.canSelect()}
    onclick={() => selection.selectPage(0)}
  >
    Page
  </button>
  <button
    type="button"
    class="button"
    disabled={!selection.canSelect()}
    onclick={() => selection.selectAll()}
  >
    Everything
  </button>
  <button
    type="button"
    class="button"
    disabled={!state.hasSelection}
    onclick={() => selection.clear()}
  >
    Clear
  </button>
  <output class="badge">{summary}</output>
</div>
