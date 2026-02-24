<template>
  <slot
    :menu-wrapper-props="menuWrapperProps"
    :matrix="counterRotation.matrix"
    :rect="adjustedRect"
  />
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import type { Rect, Rotation } from '@embedpdf/models';
import { getCounterRotation } from '@embedpdf/utils';

interface CounterRotateProps {
  rect: Rect;
  rotation: Rotation;
}

const props = defineProps<CounterRotateProps>();

const counterRotation = computed(() => getCounterRotation(props.rect, props.rotation));

const menuWrapperProps = computed(() => ({
  style: {
    position: 'absolute',
    left: `${props.rect.origin.x}px`,
    top: `${props.rect.origin.y}px`,
    transform: counterRotation.value.matrix,
    transformOrigin: '0 0',
    width: `${counterRotation.value.width}px`,
    height: `${counterRotation.value.height}px`,
    pointerEvents: 'none',
    zIndex: 3,
  } as CSSProperties,
  onPointerdown: (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
  },
  onTouchstart: (e: TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
  },
}));

const adjustedRect = computed(() => ({
  origin: { x: props.rect.origin.x, y: props.rect.origin.y },
  size: { width: counterRotation.value.width, height: counterRotation.value.height },
}));
</script>
