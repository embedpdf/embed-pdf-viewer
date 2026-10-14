<script lang="ts" module>
  // The characters of the cover's title.
  const TITLE = { start: 10, count: 52 };
</script>

<!-- The cover's title is selected on load, so the accent shows; drag over any text to see more. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useSelection } from '@embedpdf/svelte/selection';

  const selection = useSelection();
  const pages = usePageList();
  const cover = $derived(pages.current[0]?.ref);

  $effect(() => {
    if (cover) selection.select({ page: cover, ...TITLE });
  });
</script>
