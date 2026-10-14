<!--
  Anchored UI on a page that is shown: it follows the camera. The projection
  runs during render from the shared pure helper; the content's size and the
  view's are measured after mount and whenever either resizes (a camera move
  changes neither). In client space (a surface without a camera) it is
  teleported to the body and placed `fixed`, out of reach of any ancestor's
  overflow clipping.
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { observeAnchoredFit, projectAnchoredTarget, sameAnchoredFit } from '@embedpdf/web';
import type { AnchoredFit, AnchoredPlacement, AnchorTarget } from '@embedpdf/web';
import { useProjectorBinding } from './projector';

const props = defineProps<{
  target: AnchorTarget;
  placement: AnchoredPlacement;
  gap: number;
  pinned: boolean;
}>();

defineSlots<{ default?(): unknown }>();

const binding = useProjectorBinding();
const element = ref<HTMLDivElement | null>(null);
const fit = shallowRef<AnchoredFit | null>(null);
// Bumped by browser-driven invalidation, which no state change announces.
const browserMoves = ref(0);

const space = computed(() => binding.value.projector.space);

watch(
  () => binding.value.subscribe,
  (subscribe, _previous, onCleanup) => {
    if (subscribe) onCleanup(subscribe(() => (browserMoves.value += 1)));
  },
  { immediate: true },
);

// A client-space surface measures the DOM, which doesn't exist during its
// first render: one more pass after mount shows the position as soon as it
// can be measured.
onMounted(() => {
  if (space.value === 'client') browserMoves.value += 1;
});
watch(
  [() => binding.value.projector, () => props.target],
  () => {
    if (space.value === 'client') browserMoves.value += 1;
  },
  { flush: 'post' },
);

watch(
  [element, space],
  ([content, viewSpace], _previous, onCleanup) => {
    if (!content) return;
    onCleanup(
      observeAnchoredFit(content, viewSpace, (next) => {
        if (!sameAnchoredFit(fit.value, next)) fit.value = next;
      }),
    );
  },
  { immediate: true, flush: 'post' },
);

const position = computed(() => {
  void browserMoves.value;
  return projectAnchoredTarget(
    binding.value.projector,
    props.target,
    { placement: props.placement, gap: props.gap, pinned: props.pinned },
    fit.value,
  );
});

const style = computed((): CSSProperties | null => {
  const placed = position.value;
  if (!placed) return null;
  return {
    position: space.value === 'client' ? 'fixed' : 'absolute',
    left: `${placed.left}px`,
    top: `${placed.top}px`,
    // Its own width, wherever it sits: the size the placement measured.
    width: 'max-content',
    transform: placed.transform,
    pointerEvents: 'auto',
  };
});
</script>

<template>
  <Teleport to="body" :disabled="space !== 'client'">
    <div v-if="style" ref="element" :style="style" @pointerdown.stop>
      <slot />
    </div>
  </Teleport>
</template>
