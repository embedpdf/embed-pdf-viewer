<!-- Inserts next to the page you're on, then goes to the first new page. -->
<script lang="ts">
  import { usePageList, type PageRef } from '@embedpdf/svelte/runtime';
  import { usePageEdit } from '@embedpdf/svelte/page-edit';
  import { useStage, useStageState } from '@embedpdf/svelte/stage';

  /** Another PDF's bytes, to insert pages from. */
  const otherPdf = async () =>
    (await fetch('https://snippet.embedpdf.com/ebook.pdf')).arrayBuffer();

  const pageEdit = usePageEdit();
  const stage = useStage();
  const pages = usePageList();
  const currentPageIndex = useStageState((state) => state.currentPageIndex);
  const page = $derived(pages.current[currentPageIndex.current]);
  const canEdit = $derived(pageEdit.canEdit());
  let added = $state.raw<readonly PageRef[]>([]);

  // Every insert resolves { pages }: the new pages, to go to or select.
  function show(result: { pages: readonly PageRef[] }) {
    added = result.pages;
    stage.goToPage(result.pages[0]);
  }

  // A blank page after the cover, once, on load.
  let inserted = false;
  $effect(() => {
    const cover = pages.current[0];
    if (inserted || !cover) return;
    inserted = true;
    void pageEdit.insertBlank({ placement: { after: cover.ref } }).then(show);
  });

  const positions = $derived(
    added
      .map(
        (ref) =>
          pages.current.findIndex((each) => each.ref.objectNumber === ref.objectNumber) + 1,
      )
      .filter((position) => position > 0),
  );

  async function insertFromOtherPdf(after: PageRef) {
    show(
      await pageEdit.insertFromBytes(await otherPdf(), {
        pageIndexes: [0, 2],
        placement: { after },
      }),
    );
  }
</script>

{#if page}
  <div class="toolbar">
    <button
      type="button"
      class="button"
      disabled={!canEdit}
      onclick={() => pageEdit.insertBlank({ placement: { after: page.ref } }).then(show)}
    >
      + Blank page after
    </button>
    <button
      type="button"
      class="button"
      disabled={!canEdit || !pageEdit.canExtract()}
      onclick={() => pageEdit.duplicate([page.ref]).then(show)}
    >
      Duplicate page
    </button>
    <button
      type="button"
      class="button"
      disabled={!canEdit}
      onclick={() => insertFromOtherPdf(page.ref)}
    >
      + Pages 1 and 3 of another PDF
    </button>
    <span class="spacer"></span>
    <output class="readout">
      {positions.length > 0
        ? `New: page ${positions.join(' and ')} of ${pages.current.length}`
        : `${pages.current.length} pages`}
    </output>
  </div>
{/if}
