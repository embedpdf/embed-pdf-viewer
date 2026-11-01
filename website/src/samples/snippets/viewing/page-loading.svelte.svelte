<!-- PageLoading.svelte: put <PageLoading /> in each page, after <RenderLayer /> -->
<script lang="ts">
  import { usePictureState } from '@embedpdf/svelte/render';

  const picture = usePictureState();
</script>

{#if picture.current.status === 'loading' && picture.current.slow}
  <div class="page-loading" role="status" aria-label="Loading page"></div>
{:else if picture.current.status === 'error'}
  <p class="page-error">This page couldn't load.</p>
{/if}
