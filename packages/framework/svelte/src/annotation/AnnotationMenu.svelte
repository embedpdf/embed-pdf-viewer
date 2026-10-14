<!--
  Your own menu next to the selection: one anchor, also for a selection over several pages, clear
  of the rotation handle. It hides while the selection is dragged, resized or turned. What's in it
  is yours: build it from `useAnnotation()` and `useAnnotationState()`. It works in a `<Stage>`'s
  overlay and in a `<PageView>` alike: the surface gives the projection.
-->
<script lang="ts">
  import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
  import { sameSelectionAnchor } from '@embedpdf/web';
  import Anchored from '../anchored/Anchored.svelte';
  import { useProjectorBinding } from '../anchored/context';
  import { useOptionalSelector } from '../runtime/readers.svelte';
  import type { AnnotationMenuProps } from './props';

  let { children, gap = 15, placement = 'top' }: AnnotationMenuProps = $props();

  const binding = useProjectorBinding();
  // The rotation handle's offset is constant on screen, so where it is on the page depends on the
  // page's live view scale: the anchor is read again whenever the projection changes, in the same
  // update as the surface.
  const anchor = useOptionalSelector(
    AnnotationHostToken,
    (annotation) => {
      const { projector } = binding();
      const selectionAnchor = annotation.selection.getAnchor();
      if (!selectionAnchor) return null;
      const env = projector.viewEnv(selectionAnchor.page);
      return env ? annotation.getSelectionAnchorIn(env) : selectionAnchor;
    },
    null,
    sameSelectionAnchor,
  );
</script>

{#if anchor.current}
  <Anchored
    anchor={{
      page: anchor.current.page,
      bounds: anchor.current.bounds,
      ...(anchor.current.rotationHandle ? { avoid: [anchor.current.rotationHandle] } : {}),
    }}
    {placement}
    {gap}
  >
    {@render children()}
  </Anchored>
{/if}
