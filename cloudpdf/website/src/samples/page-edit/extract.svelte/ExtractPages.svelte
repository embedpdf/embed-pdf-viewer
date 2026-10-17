<!-- Tick pages, then download them as a PDF of their own. This document doesn't change. -->
<script lang="ts">
  import { saveFile, usePageList, type PageRef } from '@embedpdf/svelte/runtime';
  import { usePageEdit } from '@embedpdf/svelte/page-edit';
  import { PageView } from '@embedpdf/svelte/page-view';
  import { RenderLayer } from '@embedpdf/svelte/render';

  const pageEdit = usePageEdit();
  const pages = usePageList();
  // The middle two pages start ticked.
  let ticked = $state.raw(pages.current.slice(1, 3).map((page) => page.ref));
  let saved = $state<string | null>(null);

  const isTicked = (ref: PageRef) => ticked.some((each) => each.objectNumber === ref.objectNumber);
  const toggle = (ref: PageRef) => {
    ticked = isTicked(ref)
      ? ticked.filter((each) => each.objectNumber !== ref.objectNumber)
      : [...ticked, ref];
  };

  // In document order, whatever order they were ticked in.
  const chosen = $derived(pages.current.filter((page) => isTicked(page.ref)).map((page) => page.ref));

  async function download() {
    const bytes = await pageEdit.extract(chosen);
    saveFile(bytes, 'pages.pdf');
    saved = `pages.pdf · ${chosen.length} pages · ${Math.round(bytes.byteLength / 1024)} KB`;
  }
</script>

<div class="toolbar">
  <button
    type="button"
    class="button primary"
    disabled={chosen.length === 0 || !pageEdit.canExtract()}
    onclick={download}
  >
    Download {chosen.length === 1 ? '1 page' : `${chosen.length} pages`} as a PDF
  </button>
  <output class="readout">{saved}</output>
</div>
<ol class="grid">
  {#each pages.current as page (page.ref.objectNumber)}
    <li>
      <label class="card" data-ticked={isTicked(page.ref)}>
        <PageView page={page.ref} width={110} class="thumbnail">
          <RenderLayer />
        </PageView>
        <span class="label">
          <input type="checkbox" checked={isTicked(page.ref)} onchange={() => toggle(page.ref)} />
          Page {page.index + 1}
        </span>
      </label>
    </li>
  {/each}
</ol>
