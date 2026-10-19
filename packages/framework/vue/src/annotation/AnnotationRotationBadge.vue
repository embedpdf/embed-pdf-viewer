<!--
  <AnnotationRotationBadge>: follows the pointer while a selection is being
  turned, upright however the page is shown: it floats over the page like the
  menus, not in it. Shows nothing when no turn is in progress. Without a slot
  it shows the angle in the `chrome.readout` colors, when
  `chrome.readout.enabled`; its default slot gets the `rotation` (`angle`,
  degrees clockwise, as the commit will apply it) to draw it your way.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import type { RotationAnchor } from '@embedpdf/core-annotation';
import { AnnotationToken } from '@embedpdf/plugin-annotation';
import { paint, paintDefault, sameRotationAnchor } from '@embedpdf/web';
import type { AnchoredPlacement } from '@embedpdf/web';
import Anchored from '../anchored/Anchored.vue';
import { useOptionalSelector } from '../runtime/capabilities';
import { useAnnotationSettings } from './state';

withDefaults(
  defineProps<{
    /** Gap in screen px between the pointer and the badge. Default 16. */
    gap?: number;
    /** Where the badge sits around the pointer. Default `'right'`. */
    placement?: AnchoredPlacement;
  }>(),
  { gap: 16, placement: 'right' },
);

const slots = defineSlots<{
  /** The badge, drawn your way, with the turn in progress. */
  default?(props: { rotation: RotationAnchor }): unknown;
}>();

const rotation = useOptionalSelector(
  AnnotationToken,
  (annotation) => annotation.selection.getRotationAnchor(),
  null,
  sameRotationAnchor,
);
const readout = useAnnotationSettings((settings) => settings.chrome.readout);

const badge = computed(
  (): CSSProperties => ({
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    borderRadius: '4px',
    padding: '2px 6px',
    fontFamily: paintDefault('font-mono'),
    fontSize: '12px',
    background: paint('readout-background', readout.value.background),
    color: paint('readout-color', readout.value.color),
  }),
);
</script>

<template>
  <Anchored
    v-if="rotation && (slots.default || readout.enabled)"
    :anchor="{ page: rotation.page, bounds: { ...rotation.at, width: 0, height: 0 } }"
    :placement="placement"
    :gap="gap"
  >
    <slot v-if="slots.default" :rotation="rotation" />
    <div v-else :style="badge">{{ rotation.angle }}°</div>
  </Anchored>
</template>
