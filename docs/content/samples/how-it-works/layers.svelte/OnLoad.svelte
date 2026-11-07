<!-- Something on every layer on load: the matches of a search, and the first word selected. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useSearch } from '@embedpdf/svelte/search';
  import { useSelection } from '@embedpdf/svelte/selection';

  const search = useSearch();
  const selection = useSelection();
  const pages = usePageList();
  const cover = $derived(pages.current[0]?.ref);

  $effect(() => {
    void search.search({ text: 'PDF' });
  });
  $effect(() => {
    // [!doc-range welcome firstWord]
    if (cover) selection.select({ page: cover, start: 28, count: 9 });
    // [!/doc-range]
  });
</script>
