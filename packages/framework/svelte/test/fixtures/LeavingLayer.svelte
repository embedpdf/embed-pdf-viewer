<!--
  A layer that reads its page as it goes away, the way a tile does when it reports itself
  unpainted: its cleanup pushes the page it was on to `left`.
-->
<script lang="ts">
  import { usePage } from '../../src/runtime';

  let { left }: { left: { page: number; view: string; documentId: string }[] } = $props();

  const page = usePage();
  $effect(() => () => {
    left.push({ page: page.ref.objectNumber, view: page.view, documentId: page.documentId });
  });
</script>

<span class="leaving" data-page={page.ref.objectNumber}></span>
