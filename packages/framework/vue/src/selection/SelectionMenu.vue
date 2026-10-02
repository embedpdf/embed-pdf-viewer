<!--
  <SelectionMenu>: your content, floating over the selected text. One anchor
  however many pages the selection spans: it sits on the page where the
  selection ends. It shows once the selection settles: hidden while someone
  drags, it appears when the pointer lifts, and a selection made from code
  shows at once. It works in a <Stage>'s #overlay slot and inside a
  <PageView>: the surface provides the projection. For UI that follows the
  drag live, put `<Anchored :anchor>` with `getAnchor()` together yourself.
-->
<script setup lang="ts">
import { SelectionToken } from '@embedpdf/plugin-selection';
import { samePageBounds } from '@embedpdf/web';
import type { AnchoredPlacement } from '@embedpdf/web';
import Anchored from '../anchored/Anchored.vue';
import { useOptionalSelector } from '../runtime/capabilities';
import { useSelectionState } from './composables';

withDefaults(
  defineProps<{
    /** Gap in screen px between the selection and the menu. Default 8. */
    gap?: number;
    /** Where the menu sits around the selection. Default `'top'`. */
    placement?: AnchoredPlacement;
  }>(),
  { gap: 8, placement: 'top' },
);

defineSlots<{
  /** The menu: compose it from `useSelection()`, `copySelection`, an annotation call. */
  default?(): unknown;
}>();

const selecting = useSelectionState((state) => state.isSelecting);
// The plugin reads a new anchor object every time: compared by value, so the
// menu moves only when the selection did.
const anchor = useOptionalSelector(
  SelectionToken,
  (selection) => selection.getAnchor(),
  null,
  samePageBounds,
);
</script>

<template>
  <Anchored v-if="!selecting && anchor" :anchor="anchor" :placement="placement" :gap="gap">
    <slot />
  </Anchored>
</template>
