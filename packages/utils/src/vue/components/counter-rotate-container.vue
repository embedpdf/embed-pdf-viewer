<template>
  <slot :menu-wrapper-props="menuWrapperProps" :matrix="matrix" :rect="adjustedRect" />
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

const { matrix, width, height } = getCounterRotation(props.rect, props.rotation);

const menuWrapperProps = computed(() => ({
  style: {
    position: 'absolute',
    left: `${props.rect.origin.x}px`,
    top: `${props.rect.origin.y}px`,
    transform: matrix,
    transformOrigin: '0 0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
    zIndex: 3,
  } as CSSProperties,
  onPointerDown: (e: PointerEvent) => e.stopPropagation(),
  onTouchStart: (e: TouchEvent) => e.stopPropagation(),
}));

const adjustedRect = computed(() => ({
  origin: { x: props.rect.origin.x, y: props.rect.origin.y },
  size: { width, height },
}));
</script>
