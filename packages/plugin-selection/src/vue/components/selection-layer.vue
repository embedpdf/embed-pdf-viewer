<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import { Rotation, type Rect } from '@embedpdf/models';
import type { SelectionMenuPlacement } from '@embedpdf/plugin-selection';
import { CounterRotate } from '@embedpdf/utils/vue';
import { useSelectionPlugin } from '../hooks/use-selection';

interface SelectionLayerProps {
  documentId: string;
  pageIndex: number;
  scale?: number;
  rotation?: Rotation;
  background?: string;
}

const props = withDefaults(defineProps<SelectionLayerProps>(), {
  background: 'rgba(33,150,243)',
  rotation: Rotation.Degree0,
});

const { plugin: selPlugin } = useSelectionPlugin();
const documentState = useDocumentState(() => props.documentId);
const rects = ref<Rect[]>([]);
const boundingRect = ref<Rect | null>(null);
const placement = ref<SelectionMenuPlacement | null>(null);

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

const actualRotation = computed(() => {
  if (props.rotation !== undefined) return props.rotation;
  return documentState.value?.rotation ?? Rotation.Degree0;
});

const shouldRenderMenu = computed(
  () =>
    placement.value && placement.value.pageIndex === props.pageIndex && placement.value.isVisible,
);

watch(
  [() => selPlugin.value, () => props.documentId, () => props.pageIndex],
  ([plugin, docId, pageIdx], _, onCleanup) => {
    if (!plugin || !docId) {
      rects.value = [];
      boundingRect.value = null;
      return;
    }

    const unregister = plugin.registerSelectionOnPage({
      documentId: docId,
      pageIndex: pageIdx,
      onRectsChange: ({ rects: newRects, boundingRect: newBoundingRect }) => {
        rects.value = newRects;
        boundingRect.value = newBoundingRect;
      },
    });

    onCleanup(unregister);
  },
  { immediate: true },
);

watch(
  [() => selPlugin.value, () => props.documentId],
  ([plugin, docId], _, onCleanup) => {
    if (!plugin || !docId) {
      placement.value = null;
      return;
    }

    // Subscribe to menu placement changes for this specific document
    const unsubscribe = plugin.onMenuPlacement(docId, (newPlacement) => {
      placement.value = newPlacement;
    });

    onCleanup(unsubscribe);
  },
  { immediate: true },
);
</script>

<template>
  <template v-if="boundingRect">
    <div
      :style="{
        position: 'absolute',
        left: `${boundingRect.origin.x * actualScale}px`,
        top: `${boundingRect.origin.y * actualScale}px`,
        width: `${boundingRect.size.width * actualScale}px`,
        height: `${boundingRect.size.height * actualScale}px`,
        mixBlendMode: 'multiply',
        isolation: 'isolate',
        pointerEvents: 'none',
      }"
    >
      <div
        v-for="(rect, i) in rects"
        :key="i"
        :style="{
          position: 'absolute',
          left: `${(rect.origin.x - boundingRect.origin.x) * actualScale}px`,
          top: `${(rect.origin.y - boundingRect.origin.y) * actualScale}px`,
          width: `${rect.size.width * actualScale}px`,
          height: `${rect.size.height * actualScale}px`,
          background: background,
        }"
      />
    </div>
    <CounterRotate
      v-if="shouldRenderMenu"
      :rect="{
        origin: {
          x: placement!.rect.origin.x * actualScale,
          y: placement!.rect.origin.y * actualScale,
        },
        size: {
          width: placement!.rect.size.width * actualScale,
          height: placement!.rect.size.height * actualScale,
        },
      }"
      :rotation="actualRotation"
    >
      <template #default="{ rect, menuWrapperProps }">
        <slot
          name="selection-menu"
          :rect="rect"
          :menu-wrapper-props="menuWrapperProps"
          :placement="placement"
        />
      </template>
    </CounterRotate>
  </template>
</template>
