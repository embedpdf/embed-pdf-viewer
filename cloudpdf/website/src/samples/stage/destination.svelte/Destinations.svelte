<script lang="ts">
  import { usePageList, type PageDestination, type PageInfo } from '@embedpdf/svelte/runtime';
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  // Destinations as a link, a bookmark or the document's opening view give them.
  const destinationsFor = (pages: readonly PageInfo[]) => {
    const pageAt = (index: number) => (pages[index] ?? pages[pages.length - 1]).ref;
    return [
      {
        label: 'xyz: page 3 at (72, 100), 200%',
        destination: { kind: 'xyz', page: pageAt(2), x: 72, y: 100, zoom: 2 },
      },
      { label: 'fit: all of page 2', destination: { kind: 'fit', page: pageAt(1) } },
      {
        label: 'fitH: page 1 from y = 300',
        destination: { kind: 'fitH', page: pageAt(0), y: 300 },
      },
      {
        label: 'fitR: a box on page 4',
        destination: { kind: 'fitR', page: pageAt(3), x: 72, y: 420, width: 260, height: 160 },
      },
    ] satisfies { label: string; destination: PageDestination }[];
  };

  const stage = useStage();
  const pages = usePageList();
  const state = useStageState();
  const destinations = $derived(destinationsFor(pages.current));

  // Open where the first destination points.
  $effect(() => {
    if (pages.current.length > 0)
      stage.goToDestination(destinationsFor(pages.current)[0].destination);
  });
</script>

<div class="toolbar">
  {#each destinations as { label, destination } (label)}
    <button type="button" class="button" onclick={() => stage.goToDestination(destination)}>
      {label}
    </button>
  {/each}
  <output class="badge">
    page <strong>{state.currentPageIndex + 1}</strong> ·
    <strong>{Math.round(state.zoomLevel * 100)}%</strong>
  </output>
</div>
