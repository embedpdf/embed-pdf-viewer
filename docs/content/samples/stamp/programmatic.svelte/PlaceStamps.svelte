<script lang="ts">
  import { untrack } from 'svelte';
  import { useStage, useStageState } from '@embedpdf/svelte/stage';
  import { useAnnotationList, useAnnotationState } from '@embedpdf/svelte/annotation';
  import { useStamp, useStampAssets } from '@embedpdf/svelte/stamp';
  import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';

  // The middle of a Letter page, and the cover's empty corner, in page coordinates.
  const MIDDLE = { x: 306, y: 396 };
  const CORNER = { x: 60, y: 590, width: 220, height: 180 };

  const stamp = useStamp();
  const stage = useStage();
  const assets = useStampAssets();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const currentPage = useStageState((state) => state.currentPageIndex);
  const stamps = useAnnotationList({ subtype: 'stamp' });

  const approved = $derived(assets.current.find((asset) => asset.name === 'Approved'));
  const draft = $derived(assets.current.find((asset) => asset.name === 'Draft'));

  // On load: the standard stamps, and "Approved" in the cover's empty corner, scrolled into view.
  let placed = false;
  $effect(() => {
    if (!ready.current || placed) return;
    placed = true;
    untrack(() => {
      void loadDefaultLibrary('en')
        .then((bytes) => stamp.importLibrary(bytes))
        .then(({ library }) => {
          const asset = stamp
            .listAssets({ libraryId: library.id })
            .find((candidate) => candidate.name === 'Approved');
          if (!asset) return;
          return stamp.placeAsset(asset.id, {
            page: 0,
            center: { x: 170, y: 680 },
            targetWidth: 180,
            rotation: -8,
          });
        })
        .then(() => stage.reveal(0, { rect: CORNER }));
    });
  });

  function approveThisPage() {
    if (!approved) return;
    void stamp.placeAsset(approved.id, { page: currentPage.current, center: MIDDLE, select: true });
  }

  function draftEveryPage() {
    if (!draft) return;
    void stamp.placeAssetOnPages(draft.id, 'all', {
      center: MIDDLE,
      targetWidth: 320,
      rotation: -30,
    });
  }
</script>

<div class="toolbar">
  <button type="button" class="button" disabled={!approved} onclick={approveThisPage}>
    Approve this page
  </button>
  <button type="button" class="button" disabled={!draft} onclick={draftEveryPage}>
    “Draft” on every page
  </button>
  <span class="spacer"></span>
  <output class="readout">
    {stamps.current.length}
    {stamps.current.length === 1 ? 'stamp' : 'stamps'} in the document
  </output>
</div>
