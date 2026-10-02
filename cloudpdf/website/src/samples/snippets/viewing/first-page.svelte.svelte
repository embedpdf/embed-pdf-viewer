<script lang="ts">
  import { PageView } from '@embedpdf/svelte/page-view';
  import { RenderLayer } from '@embedpdf/svelte/render';
</script>

<PageView page={0} width={320}>
  <RenderLayer />
</PageView>
