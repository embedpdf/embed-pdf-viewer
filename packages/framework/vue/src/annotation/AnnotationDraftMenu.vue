<!--
  <AnnotationDraftMenu>: floats over a shape being drawn with several clicks
  (a polygon, a polyline). Its default slot gets the `draft`: its `subtype`,
  `pointCount`, `minPoints`, `canFinish` and where it is. The verbs are
  capability calls: `useAnnotation().draft.finish()` and `.draft.cancel()`.
-->
<script setup lang="ts">
import type { CreationDraftAnchor } from '@embedpdf/core-annotation';
import { AnnotationToken } from '@embedpdf/plugin-annotation';
import { sameCreationDraftAnchor } from '@embedpdf/web';
import type { AnchoredPlacement } from '@embedpdf/web';
import Anchored from '../anchored/Anchored.vue';
import { useOptionalSelector } from '../runtime/capabilities';

withDefaults(
  defineProps<{
    /** Gap in screen px between the shape and the menu. Default 8. */
    gap?: number;
    /** Where the menu sits around the shape. Default `'top'`. */
    placement?: AnchoredPlacement;
  }>(),
  { gap: 8, placement: 'top' },
);

defineSlots<{
  /** The menu, with the shape being drawn. */
  default?(props: { draft: CreationDraftAnchor }): unknown;
}>();

// The plugin reads a new anchor object every time: compared by value, so the
// menu moves only when the shape did.
const draft = useOptionalSelector(
  AnnotationToken,
  (annotation) => annotation.draft.get(),
  null,
  sameCreationDraftAnchor,
);
</script>

<template>
  <Anchored v-if="draft" :anchor="draft" :placement="placement" :gap="gap">
    <slot :draft="draft" />
  </Anchored>
</template>
