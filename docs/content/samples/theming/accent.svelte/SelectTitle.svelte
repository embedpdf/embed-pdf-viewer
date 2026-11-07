<script lang="ts" module>
  // The characters of "Documents", the first word on the cover.
  // [!doc-range welcome firstWord]
  const FIRST_WORD = { start: 28, count: 9 };
  // [!/doc-range]
</script>

<!-- The first word is selected on load, so the accent shows; drag over any text to see more. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useSelection } from '@embedpdf/svelte/selection';

  const selection = useSelection();
  const pages = usePageList();
  const cover = $derived(pages.current[0]?.ref);

  $effect(() => {
    if (cover) selection.select({ page: cover, ...FIRST_WORD });
  });
</script>
