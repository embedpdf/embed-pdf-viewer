<script lang="ts" module>
  const TITLE = { start: 10, count: 52 };
</script>

<!-- On load: the cover's title is selected and "PDF" is found, so every color has something to paint. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useSearch } from '@embedpdf/svelte/search';
  import { useSelection } from '@embedpdf/svelte/selection';

  const selection = useSelection();
  const search = useSearch();
  const pages = usePageList();
  const cover = $derived(pages.current[0]?.ref);

  onMount(() => {
    void search.search({ text: 'PDF' });
  });
  $effect(() => {
    if (cover) selection.select({ page: cover, ...TITLE });
  });
</script>
