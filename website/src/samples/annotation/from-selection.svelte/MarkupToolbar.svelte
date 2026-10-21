<!-- The selected text becomes a mark, one per page; the selection is cleared afterwards. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useStage } from '@embedpdf/svelte/stage';
  import { useSelection, useSelectionState } from '@embedpdf/svelte/selection';
  import { useAnnotation } from '@embedpdf/svelte/annotation';

  // On page 2: the characters of the sentence in its “Your turn” box, and where it is.
  const SENTENCE = { start: 605, count: 44 };
  const SENTENCE_BOX = { x: 68, y: 446, width: 256, height: 16 };

  const MARKUP = [
    { tool: 'highlight', label: 'Highlight' },
    { tool: 'underline', label: 'Underline' },
    { tool: 'strikeout', label: 'Strike out' },
    { tool: 'squiggly', label: 'Squiggly' },
  ];

  const annotation = useAnnotation();
  const selection = useSelection();
  const hasSelection = useSelectionState((state) => state.hasSelection);
  const stage = useStage();
  const pages = usePageList();
  let status = $state('');

  // On load: the sentence is selected, ready to mark, and in view.
  $effect(() => {
    const page = pages.current[1]?.ref;
    if (!page) return;
    untrack(() => {
      selection.select({ page, ...SENTENCE });
      stage.reveal(page, { rect: SENTENCE_BOX });
    });
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
