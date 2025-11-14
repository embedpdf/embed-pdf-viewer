<template>
  <div
    v-if="boundingRect && activeTool"
    :style="{
      mixBlendMode: blendMode,
      pointerEvents: 'none',
      position: 'absolute',
      inset: 0,
    }"
  >
    <Highlight
      v-if="activeTool.defaults.type === PdfAnnotationSubtype.HIGHLIGHT"
      :color="activeTool.defaults.color"
      :opacity="activeTool.defaults.opacity"
      :segmentRects="rects"
      :scale="scale"
    />
    <Underline
      v-else-if="activeTool.defaults.type === PdfAnnotationSubtype.UNDERLINE"
      :color="activeTool.defaults.color"
      :opacity="activeTool.defaults.opacity"
      :segmentRects="rects"
      :scale="scale"
    />
    <Strikeout
      v-else-if="activeTool.defaults.type === PdfAnnotationSubtype.STRIKEOUT"
      :color="activeTool.defaults.color"
      :opacity="activeTool.defaults.opacity"
      :segmentRects="rects"
      :scale="scale"
    />
    <Squiggly
      v-else-if="activeTool.defaults.type === PdfAnnotationSubtype.SQUIGGLY"
      :color="activeTool.defaults.color"
      :opacity="activeTool.defaults.opacity"
      :segmentRects="rects"
      :scale="scale"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, watchEffect, computed } from 'vue';
import { blendModeToCss, PdfAnnotationSubtype, PdfBlendMode, Rect } from '@embedpdf/models';
import { AnnotationTool } from '@embedpdf/plugin-annotation';
import { useSelectionCapability } from '@embedpdf/plugin-selection/vue';
import { useAnnotationCapability } from '../hooks';
import Highlight from './text-markup/highlight.vue';
import Underline from './text-markup/underline.vue';
import Strikeout from './text-markup/strikeout.vue';
import Squiggly from './text-markup/squiggly.vue';

const props = defineProps<{
  documentId: string;
  pageIndex: number;
  scale: number;
}>();

const { provides: selectionProvides } = useSelectionCapability();
const { provides: annotationProvides } = useAnnotationCapability();
const rects = ref<Rect[]>([]);
const boundingRect = ref<Rect | null>(null);
const activeTool = ref<AnnotationTool | null>(null);

watchEffect((onCleanup) => {
  const unsubscribers: (() => void)[] = [];

  if (selectionProvides.value) {
    const scoped = selectionProvides.value.forDocument(props.documentId);
    const off = scoped.onSelectionChange(() => {
      rects.value = scoped.getHighlightRectsForPage(props.pageIndex);
      boundingRect.value = scoped.getBoundingRectForPage(props.pageIndex);
    });
    unsubscribers.push(off);
  }

  if (annotationProvides.value) {
    const scoped = annotationProvides.value.forDocument(props.documentId);
    // Initialize with current active tool
    activeTool.value = scoped.getActiveTool();

    const off = scoped.onActiveToolChange((event) => (activeTool.value = event));
    unsubscribers.push(off);
  }

  onCleanup(() => {
    unsubscribers.forEach((unsub) => unsub());
  });
});

const blendMode = computed(() => {
  if (!activeTool.value) return blendModeToCss(PdfBlendMode.Normal);
  const defaultMode =
    activeTool.value.defaults.type === PdfAnnotationSubtype.HIGHLIGHT
      ? PdfBlendMode.Multiply
      : PdfBlendMode.Normal;
  return blendModeToCss(activeTool.value.defaults.blendMode ?? defaultMode);
});
</script>
