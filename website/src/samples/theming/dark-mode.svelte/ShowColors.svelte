<script lang="ts" module>
  const FIRST_WORD = { start: 28, count: 9 };
</script>

<!-- On load: the first word is selected and "PDF" is found, so every color has something to paint. -->
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
    if (cover) selection.select({ page: cover, ...FIRST_WORD });
  });
</script>
