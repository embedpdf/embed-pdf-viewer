<!-- Something selected on load, so the menu shows: the title on the cover. -->
<script lang="ts">
  import { usePageList } from '@embedpdf/svelte/runtime';
  import { useSelection } from '@embedpdf/svelte/selection';

  const selection = useSelection();
  const pages = usePageList();
  const cover = $derived(pages.current[0]?.ref);

  $effect(() => {
    if (cover) selection.select({ page: cover, start: 10, count: 52 });
  });
</script>
