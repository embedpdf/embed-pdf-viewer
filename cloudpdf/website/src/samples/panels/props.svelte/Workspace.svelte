<script lang="ts">
  import { onMount } from 'svelte';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { SearchLayer, useSearch, useSearchHits } from '@embedpdf/svelte/search';
  import { useShell } from '@embedpdf/svelte/shell';
  import MatchPanel from './MatchPanel.svelte';

  const shell = useShell();
  const search = useSearch();
  const hits = useSearchHits();

  // Every "PDF" on the pages, and the first one open in the panel.
  onMount(() => {
    void search.search({ text: 'PDF' });
    shell.open('match', { exclusive: 'right', props: { index: 0 } });
  });
</script>

<div class="workspace">
  <Stage class="stage">
    <RenderLayer />
    <!-- A click on a match opens it in the panel. -->
    <SearchLayer
      onHitClick={(hit) =>
        shell.open('match', { exclusive: 'right', props: { index: hits.current.indexOf(hit) } })}
    />
  </Stage>
  <MatchPanel />
</div>
