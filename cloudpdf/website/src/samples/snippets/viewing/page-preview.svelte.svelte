<script lang="ts">
  import { PageView } from '@embedpdf/svelte/page-view';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import type { PageRef } from '@embedpdf/svelte/runtime';

  let { page }: { page: PageRef } = $props();
</script>

<PageView {page} width={240}>
  <RenderLayer />
</PageView>
