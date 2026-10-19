<!--
  <Anchored>: positions its content around a page-space box, on whichever page
  surface is in scope (a <Stage>'s #overlay slot). Once its size is measured it
  flips to the other side when the chosen one has no room, and stays inside the
  view, unless `pinned`. A click inside it never reaches the surface (which
  would read it as a click outside). On a page that isn't shown it renders
  nothing and reads only the pages on screen, so hundreds of badges cost only
  the ones in view while people scroll and zoom.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { AnchoredPlacement, AnchoredRect, AnchorTarget } from '@embedpdf/web';
import PlacedAnchored from './PlacedAnchored.vue';
import { useShownPages } from './projector';

const props = withDefaults(
  defineProps<{
    /**
     * The box on a page to sit next to, in page coordinates: `{ page, bounds }`,
     * with `avoid` points to keep clear of. `null`, or a target without
     * `bounds` (a search match with no geometry), hides it.
     */
    anchor: (Omit<AnchorTarget, 'bounds'> & { bounds?: AnchoredRect }) | null;
    /** Where to sit: a side of the box, centred, or lined up with the side's start or end (`'top-end'`). */
    placement?: AnchoredPlacement;
    /**
     * Gap in screen px between the box and the content, and between the content
     * and the view's edge. Negative overlaps the box.
     */
    gap?: number;
    /**
     * Stay where `placement` puts it: never flip to the other side, never move
     * to stay in view, and scroll away with the box. For badges and status;
     * menus leave it off.
     */
    pinned?: boolean;
  }>(),
  { placement: 'top', gap: 8, pinned: false },
);

defineSlots<{ default?(): unknown }>();

const shown = useShownPages();

/** The anchor with its box, while it has one on a shown page. */
const target = computed((): AnchorTarget | null => {
  const anchor = props.anchor;
  if (!anchor?.bounds) return null;
  if (shown && !shown.value.has(anchor.page.objectNumber)) return null;
  return { ...anchor, bounds: anchor.bounds };
});
</script>

<template>
  <PlacedAnchored v-if="target" :target="target" :placement="placement" :gap="gap" :pinned="pinned">
    <slot />
  </PlacedAnchored>
</template>
