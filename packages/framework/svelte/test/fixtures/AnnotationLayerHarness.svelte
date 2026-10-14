<!-- The annotation page once the test hands it a page context (`page.value`). -->
<script lang="ts">
  import type { AnnotationRenderer } from '../../src/annotation';
  import type { PageContextValue } from '../../src/runtime';
  import AnnotationPage from './AnnotationPage.svelte';

  let {
    page,
    renderers,
    customHandles = false,
    probe = false,
  }: {
    page: { value: PageContextValue | null };
    renderers?: AnnotationRenderer[];
    customHandles?: boolean;
    probe?: boolean;
  } = $props();
</script>

{#if page.value}
  {#key page.value}
    <AnnotationPage page={page.value} {renderers} {customHandles} {probe} />
  {/key}
{/if}
