<!--
  <AnnotationMenu>: your own menu next to the selection (one anchor, also for a
  selection over several pages), clear of the rotation handle. It hides while
  the selection is dragged, resized or turned. What's in it is yours: build it
  from `useAnnotation()` and `useAnnotationState()`. Put it in the Stage's
  #overlay slot; it works inside a <PageView> too (the surface provides the
  projection).
-->
<script setup lang="ts">
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { sameSelectionAnchor } from '@embedpdf/web';
import type { AnchoredPlacement } from '@embedpdf/web';
import Anchored from '../anchored/Anchored.vue';
import { useProjectorBinding } from '../anchored/projector';
import { useOptionalSelector } from '../runtime/capabilities';

withDefaults(
  defineProps<{
    /** Gap in screen px between the selection box and the menu. Default 15. */
    gap?: number;
    /** Where the menu sits around the selection. Default `'top'`. */
    placement?: AnchoredPlacement;
  }>(),
  { gap: 15, placement: 'top' },
);

defineSlots<{
  /** The menu: compose it from `useAnnotation()` and `useAnnotationState()`. */
  default?(): unknown;
}>();

// Reading the binding makes the anchor follow projection changes in the same
// update as the pages: the rotation handle's offset is screen-constant, so its
// place on the page depends on the page's live view scale.
const binding = useProjectorBinding();
const anchor = useOptionalSelector(
  AnnotationHostToken,
  (host) => {
    const selection = host.selection.getAnchor();
    if (!selection) return null;
    const view = binding.value.projector.viewEnv(selection.page);
    return view ? host.getSelectionAnchorIn(view) : selection;
  },
  null,
  sameSelectionAnchor,
);
</script>

<template>
  <Anchored
    v-if="anchor"
    :anchor="{
      page: anchor.page,
      bounds: anchor.bounds,
      ...(anchor.rotationHandle ? { avoid: [anchor.rotationHandle] } : {}),
    }"
    :placement="placement"
    :gap="gap"
  >
    <slot />
  </Anchored>
</template>
