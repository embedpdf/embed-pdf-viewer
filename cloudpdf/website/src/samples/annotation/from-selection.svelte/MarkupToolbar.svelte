<!-- The selected text becomes a mark, one per page; the selection is cleared afterwards. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useSelection, useSelectionState } from '@embedpdf/svelte/selection';
  import { useAnnotation } from '@embedpdf/svelte/annotation';

  // On the cover: the characters of the title's first line.
  const FIRST_LINE = { start: 10, count: 17 };

  const MARKUP = [
    { tool: 'highlight', label: 'Highlight' },
    { tool: 'underline', label: 'Underline' },
    { tool: 'strikeout', label: 'Strike out' },
    { tool: 'squiggly', label: 'Squiggly' },
  ];

  const annotation = useAnnotation();
  const selection = useSelection();
  const hasSelection = useSelectionState((state) => state.hasSelection);
  const pages = usePageList();
  let status = $state('');

  // On load: the title's first line is selected, ready to mark.
  $effect(() => {
    const cover = pages.current[0]?.ref;
    if (cover) untrack(() => selection.select({ page: cover, ...FIRST_LINE }));
  });

  async function mark(tool: string, label: string) {
    const { annotations } = await annotation.createFromSelection(tool);
    status = `${label}: ${annotations.length} made`;
  }
</script>

<div class="toolbar">
  {#each MARKUP as { tool, label } (tool)}
    <button
      type="button"
      class="button"
      disabled={!hasSelection.current}
      onclick={() => void mark(tool, label)}
    >
      {label}
    </button>
  {/each}
  <span class="spacer"></span>
  <output class="readout">
    {hasSelection.current ? 'Text selected' : status || 'Select text'}
  </output>
</div>
