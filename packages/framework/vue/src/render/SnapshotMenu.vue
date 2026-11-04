<!--
  <SnapshotMenu>: your content, floating by the snapshot the `snapshot` tool
  holds, once it's taken: hidden while the box is still dragged, it appears
  when the pointer lifts. It works in a <Stage>'s #overlay slot and inside a
  <PageView>: the surface provides the projection. Compose it from
  `useSnapshot()`, `copyImage` and `saveFile`.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { RenderToken } from '@embedpdf/plugin-render';
import type { AnchoredPlacement } from '@embedpdf/web';
import Anchored from '../anchored/Anchored.vue';
import { useOptionalSelector } from '../runtime/capabilities';

withDefaults(
  defineProps<{
    /** Gap in screen px between the box and the menu. Default 8. */
    gap?: number;
    /** Where the menu sits around the box. Default `'bottom'`. */
    placement?: AnchoredPlacement;
  }>(),
  { gap: 8, placement: 'bottom' },
);

defineSlots<{
  /** The menu: compose it from `useSnapshot()`, `copyImage` and `saveFile`. */
  default?(): unknown;
}>();

const snapshot = useOptionalSelector(RenderToken, (render) => render.getSnapshot(), null);
const anchor = computed(
  () => snapshot.value && { page: snapshot.value.page, bounds: snapshot.value.rect },
);
</script>

<template>
  <Anchored v-if="anchor" :anchor="anchor" :placement="placement" :gap="gap">
    <slot />
  </Anchored>
</template>
