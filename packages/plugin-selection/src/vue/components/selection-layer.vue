<script setup lang="ts">
import { ref, watch, computed, useSlots, type VNode } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import { Rotation, type Rect } from '@embedpdf/models';
import type { SelectionMenuPlacement } from '@embedpdf/plugin-selection';
import { CounterRotate, type MenuWrapperProps } from '@embedpdf/utils/vue';
import { useSelectionPlugin } from '../hooks/use-selection';
import type { SelectionSelectionContext, SelectionSelectionMenuRenderFn } from '../types';

interface SelectionLayerProps {
  documentId: string;
  pageIndex: number;
  scale?: number;
  rotation?: Rotation;
  background?: string;
  /** Render function for selection menu (schema-driven approach) */
  selectionMenu?: SelectionSelectionMenuRenderFn;
}

const props = withDefaults(defineProps<SelectionLayerProps>(), {
  background: 'rgba(33,150,243)',
  rotation: Rotation.Degree0,
});

const slots = useSlots();
const { plugin: selPlugin } = useSelectionPlugin();
const documentState = useDocumentState(() => props.documentId);
const page = computed(() => documentState.value?.document?.pages?.[props.pageIndex]);
const rects = ref<Rect[]>([]);
const boundingRect = ref<Rect | null>(null);
const placement = ref<SelectionMenuPlacement | null>(null);

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

const actualRotation = computed(() => {
  if (props.rotation !== undefined) return props.rotation;
  // Combine page intrinsic rotation with document rotation
  const pageRotation = page.value?.rotation ?? 0;
  const docRotation = documentState.value?.rotation ?? 0;
  return ((pageRotation + docRotation) % 4) as Rotation;
});

// Check if menu should render: placement is valid AND (render fn OR slot exists)
const shouldRenderMenu = computed(() => {
  if (!placement.value) return false;
  if (placement.value.pageIndex !== props.pageIndex) return false;
  if (!placement.value.isVisible) return false;

  // Must have either render function or slot
  return !!props.selectionMenu || !!slots['selection-menu'];
});

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

    const unsubscribe = plugin.onMenuPlacement(docId, (newPlacement) => {
      placement.value = newPlacement;
    });

    onCleanup(unsubscribe);
  },
  { immediate: true },
);

// --- Selection Menu Logic ---

// Build context object for selection menu
const buildContext = (): SelectionSelectionContext => ({
  type: 'selection',
  pageIndex: props.pageIndex,
});

// Build placement hints from plugin placement data
const buildMenuPlacement = () => ({
  suggestTop: placement.value?.suggestTop ?? false,
  spaceAbove: placement.value?.spaceAbove ?? 0,
  spaceBelow: placement.value?.spaceBelow ?? 0,
});

// Render via function (for schema-driven approach)
const renderSelectionMenu = (rect: Rect, menuWrapperProps: MenuWrapperProps): VNode | null => {
  if (!props.selectionMenu) return null;

  return props.selectionMenu({
    rect,
    menuWrapperProps,
    selected: true, // Selection is always "selected" when visible
    placement: buildMenuPlacement(),
    context: buildContext(),
  });
};
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

    <!-- Selection Menu: Supports BOTH render function and slot -->
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
        <!-- Priority 1: Render function prop (schema-driven) -->
        <component v-if="selectionMenu" :is="renderSelectionMenu(rect, menuWrapperProps)" />

        <!-- Priority 2: Slot (manual customization) -->
        <slot
          v-else
          name="selection-menu"
          :context="buildContext()"
          :selected="true"
          :rect="rect"
          :placement="buildMenuPlacement()"
          :menuWrapperProps="menuWrapperProps"
        />
      </template>
    </CounterRotate>
  </template>
</template>
