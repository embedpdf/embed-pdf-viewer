<template>
  <div
    v-for="(segment, i) in segments"
    :key="i"
    @pointerdown="onClick"
    :style="{
      position: 'absolute',
      left: `${quadBoundsRelativeToContainer(segment, rect, scale).left}px`,
      top: `${quadBoundsRelativeToContainer(segment, rect, scale).top}px`,
      width: `${quadBoundsRelativeToContainer(segment, rect, scale).width}px`,
      height: `${quadBoundsRelativeToContainer(segment, rect, scale).height}px`,
      background: appearanceActive ? 'transparent' : resolvedColor,
      opacity: appearanceActive ? undefined : opacity,
      clipPath: appearanceActive ? undefined : quadClipPath(segment, rect, scale),
      pointerEvents: onClick ? 'auto' : 'none',
      cursor: onClick ? 'pointer' : 'default',
      zIndex: onClick ? 1 : undefined,
    }"
  ></div>
</template>

<script lang="ts">
export default { inheritAttrs: false };
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { Quad, Rect } from '@embedpdf/models';
import {
  quadBoundsRelativeToContainer,
  quadClipPath,
  resolveTextMarkupSegments,
} from '../../../shared/components/text-markup/quad-geometry';

const props = withDefaults(
  defineProps<{
    strokeColor?: string;
    opacity?: number;
    segmentRects: Rect[];
    segmentQuads?: Quad[];
    rect?: Rect;
    scale: number;
    onClick?: (e: PointerEvent) => void;
    appearanceActive?: boolean;
  }>(),
  {
    opacity: 0.5,
    appearanceActive: false,
  },
);

const resolvedColor = computed(() => props.strokeColor ?? '#FFFF00');
const segments = computed(() =>
  resolveTextMarkupSegments(props.segmentRects, props.segmentQuads),
);
</script>
