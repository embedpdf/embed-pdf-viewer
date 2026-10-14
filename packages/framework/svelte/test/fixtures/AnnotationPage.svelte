<!--
  One page with an `<AnnotationLayer>` on it, for the annotation tests: `renderers`, your own
  `handle` snippet when `customHandles`, and the state probe when `probe`.
-->
<script lang="ts">
  import { AnnotationLayer, type AnnotationRenderer } from '../../src/annotation';
  import { setPageContext, type PageContextValue } from '../../src/runtime';
  import AnnotationProbe from './AnnotationProbe.svelte';
  import RecordingHandle from './RecordingHandle.svelte';

  let {
    page,
    renderers,
    customHandles = false,
    probe = false,
  }: {
    page: PageContextValue;
    renderers?: AnnotationRenderer[];
    customHandles?: boolean;
    probe?: boolean;
  } = $props();

  // One page per mount: it never changes.
  // svelte-ignore state_referenced_locally
  setPageContext(page);
</script>

{#if customHandles}
  <AnnotationLayer {renderers}>
    {#snippet handle(props)}
      <RecordingHandle handle={props} />
    {/snippet}
  </AnnotationLayer>
{:else}
  <AnnotationLayer {renderers} />
{/if}
{#if probe}
  <AnnotationProbe />
{/if}
