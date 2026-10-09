<!-- Each control shows only when its check says yes. -->
<script lang="ts">
  import { saveFile, useDocuments, usePageList } from '@embedpdf/svelte/runtime';
  import { useSearch } from '@embedpdf/svelte/search';
  import { copySelection, useSelection, useSelectionState } from '@embedpdf/svelte/selection';

  const documents = useDocuments();
  const search = useSearch();
  const selection = useSelection();
  const hasSelection = useSelectionState((state) => state.hasSelection);
  const pages = usePageList();
  const cover = $derived(pages.current[0]?.ref);
  // A check read once into a derived value: an effect that reads it runs again only when the
  // answer changes, not on every change in the viewer.
  const canSearch = $derived(search.canSearch());
  let text = $state('PDF');
  let copied = $state('');

  // On load: a search, and some text selected, so every check has something to act on.
  $effect(() => {
    if (canSearch) void search.search({ text });
  });
  $effect(() => {
    if (cover) selection.select({ page: cover, start: 10, count: 52 });
  });

  async function copy() {
    await copySelection(selection).catch(() => {}); // the browser may refuse the clipboard
    copied = await selection.readText();
  }

  async function download() {
    saveFile(await documents.download(), 'ebook.pdf');
  }
</script>

<div class="toolbar">
  {#if canSearch}
    <input class="field" type="search" aria-label="Search" bind:value={text} />
  {/if}
  {#if selection.canCopy()}
    <button type="button" class="button" disabled={!hasSelection.current} onclick={copy}>
      Copy
    </button>
  {/if}
  {#if documents.canDownload()}
    <button type="button" class="button" onclick={download}>Download</button>
  {/if}
</div>
<p class="note">{copied ? `Copied: “${copied}”` : ' '}</p>
