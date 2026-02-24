<template>
  <div
    v-for="(rect, i) in rects"
    :key="i"
    @pointerdown="onClick"
    @touchstart="onClick"
    :style="{
      position: 'absolute',
      border,
      left: `${(boundingRect ? rect.origin.x - boundingRect.origin.x : rect.origin.x) * scale}px`,
      top: `${(boundingRect ? rect.origin.y - boundingRect.origin.y : rect.origin.y) * scale}px`,
      width: `${rect.size.width * scale}px`,
      height: `${rect.size.height * scale}px`,
      background: color,
      opacity: opacity,
      pointerEvents: onClick ? 'auto' : 'none',
      cursor: onClick ? 'pointer' : 'default',
      zIndex: onClick ? 1 : undefined,
    }"
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import type { Rect } from '@embedpdf/models';

interface HighlightProps {
  color?: string;
  opacity?: number;
  border?: string;
  rects: Rect[];
  rect?: Rect;
  scale: number;
  onClick?: (e: PointerEvent | TouchEvent) => void;
}

const props = withDefaults(defineProps<HighlightProps>(), {
  color: '#FFFF00',
  opacity: 1,
  border: '1px solid red',
});

// Rename rect to boundingRect for clarity in template
const boundingRect = props.rect;
</script>
