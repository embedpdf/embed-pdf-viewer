<!--
  A menu over a shape being drawn click by click (a polygon, a polyline): the `children` snippet
  gets the shape (`canFinish`, `pointCount`, …). The verbs are the API's:
  `useAnnotation().draft.finish()` and `.draft.cancel()`.
-->
<script lang="ts">
  import { AnnotationToken } from '@embedpdf/plugin-annotation';
  import { sameCreationDraftAnchor } from '@embedpdf/web';
  import Anchored from '../anchored/Anchored.svelte';
  import { useOptionalSelector } from '../runtime/readers.svelte';
  import type { AnnotationDraftMenuProps } from './props';

  let { children, gap = 8, placement = 'top' }: AnnotationDraftMenuProps = $props();

  const draft = useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.draft.get(),
    null,
    sameCreationDraftAnchor,
  );
</script>

{#if draft.current}
  <Anchored anchor={draft.current} {placement} {gap}>
    {@render children(draft.current)}
  </Anchored>
{/if}
