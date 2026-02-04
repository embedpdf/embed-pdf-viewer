<template>
  <div v-if="items.length" :style="{ position: 'absolute', inset: 0, pointerEvents: 'none' }">
    <template v-for="item in items" :key="item.id">
      <!-- Area redaction -->
      <template v-if="item.kind === 'area'">
        <div
          :style="{
            position: 'absolute',
            left: `${item.rect.origin.x * scale}px`,
            top: `${item.rect.origin.y * scale}px`,
            width: `${item.rect.size.width * scale}px`,
            height: `${item.rect.size.height * scale}px`,
            background: 'transparent',
            outline: selectedId === item.id ? `1px solid ${bboxStroke}` : 'none',
            outlineOffset: '2px',
            border: `1px solid red`,
            pointerEvents: 'auto',
            cursor: 'pointer',
          }"
          @pointerdown="(e: PointerEvent) => select(e, item.id)"
          @touchstart="(e: TouchEvent) => select(e, item.id)"
        />

        <!-- Selection Menu: Supports BOTH render function and slot -->
        <CounterRotate
          v-if="shouldShowMenu(item.id)"
          :rect="{
            origin: { x: item.rect.origin.x * scale, y: item.rect.origin.y * scale },
            size: { width: item.rect.size.width * scale, height: item.rect.size.height * scale },
          }"
          :rotation="rotation"
        >
          <template #default="{ rect, menuWrapperProps }">
            <!-- Priority 1: Render function prop (schema-driven) -->
            <component
              v-if="selectionMenu"
              :is="renderSelectionMenu(item, rect, menuWrapperProps)"
            />

            <!-- Priority 2: Slot (manual customization) -->
            <slot
              v-else
              name="selection-menu"
              :context="buildContext(item)"
              :selected="selectedId === item.id"
              :rect="rect"
              :placement="menuPlacement"
              :menuWrapperProps="menuWrapperProps"
            />
          </template>
        </CounterRotate>
      </template>

      <!-- Text redaction -->
      <template v-else>
        <div
          :style="{
            position: 'absolute',
            left: `${item.rect.origin.x * scale}px`,
            top: `${item.rect.origin.y * scale}px`,
            width: `${item.rect.size.width * scale}px`,
            height: `${item.rect.size.height * scale}px`,
            background: 'transparent',
            outline: selectedId === item.id ? `1px solid ${bboxStroke}` : 'none',
            outlineOffset: '2px',
            pointerEvents: 'auto',
            cursor: selectedId === item.id ? 'pointer' : 'default',
          }"
        >
          <Highlight
            :rect="item.rect"
            :rects="item.rects"
            color="transparent"
            border="1px solid red"
            :scale="scale"
            :on-click="(e: PointerEvent | TouchEvent) => select(e, item.id)"
          />
        </div>

        <!-- Selection Menu: Supports BOTH render function and slot -->
        <CounterRotate
          v-if="shouldShowMenu(item.id)"
          :rect="{
            origin: {
              x: item.rect.origin.x * scale,
              y: item.rect.origin.y * scale,
            },
            size: {
              width: item.rect.size.width * scale,
              height: item.rect.size.height * scale,
            },
          }"
          :rotation="rotation"
        >
          <template #default="{ rect, menuWrapperProps }">
            <!-- Priority 1: Render function prop (schema-driven) -->
            <component
              v-if="selectionMenu"
              :is="renderSelectionMenu(item, rect, menuWrapperProps)"
            />

            <!-- Priority 2: Slot (manual customization) -->
            <slot
              v-else
              name="selection-menu"
              :context="buildContext(item)"
              :selected="selectedId === item.id"
              :rect="rect"
              :placement="menuPlacement"
              :menuWrapperProps="menuWrapperProps"
            />
          </template>
        </CounterRotate>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, useSlots, type VNode } from 'vue';
import type { Rect } from '@embedpdf/models';
import { Rotation } from '@embedpdf/models';
import { CounterRotate } from '@embedpdf/utils/vue';
import type { MenuWrapperProps, SelectionMenuPlacement } from '@embedpdf/utils/vue';
import type { RedactionItem } from '@embedpdf/plugin-redaction';
import { useRedactionCapability } from '../hooks/use-redaction';
import Highlight from './highlight.vue';
import type { RedactionSelectionContext, RedactionSelectionMenuRenderFn } from './types';

interface PendingRedactionsProps {
  documentId: string;
  pageIndex: number;
  scale: number;
  rotation: Rotation;
  bboxStroke?: string;
  /** Render function for selection menu (schema-driven approach) */
  selectionMenu?: RedactionSelectionMenuRenderFn;
}

const props = withDefaults(defineProps<PendingRedactionsProps>(), {
  rotation: Rotation.Degree0,
  bboxStroke: 'rgba(0,0,0,0.8)',
});

const slots = useSlots();
const { provides: redaction } = useRedactionCapability();
const items = ref<RedactionItem[]>([]);
const selectedId = ref<string | null>(null);

watch(
  [redaction, () => props.documentId, () => props.pageIndex],
  ([redactionValue, docId, pageIdx], _, onCleanup) => {
    if (!redactionValue) {
      items.value = [];
      selectedId.value = null;
      return;
    }

    const scoped = redactionValue.forDocument(docId);

    // Initialize with current state - only show legacy mode items
    const currentState = scoped.getState();
    items.value = (currentState.pending[pageIdx] ?? []).filter((it) => it.source === 'legacy');
    selectedId.value =
      currentState.selected && currentState.selected.page === pageIdx
        ? currentState.selected.id
        : null;

    // Subscribe to future changes - only show legacy mode items
    const off1 = scoped.onPendingChange((map) => {
      items.value = (map[pageIdx] ?? []).filter((it) => it.source === 'legacy');
    });

    const off2 = scoped.onSelectedChange((sel) => {
      selectedId.value = sel && sel.page === pageIdx ? sel.id : null;
    });

    onCleanup(() => {
      off1?.();
      off2?.();
    });
  },
  { immediate: true },
);

const select = (e: PointerEvent | TouchEvent, id: string) => {
  e.stopPropagation();
  const redactionValue = redaction.value;
  if (!redactionValue) return;
  redactionValue.forDocument(props.documentId).selectPending(props.pageIndex, id);
};

// --- Selection Menu Logic ---

// Check if we should show menu for this item
const shouldShowMenu = (itemId: string): boolean => {
  const isSelected = selectedId.value === itemId;
  return isSelected && (!!props.selectionMenu || !!slots['selection-menu']);
};

// Build context object for selection menu
const buildContext = (item: RedactionItem): RedactionSelectionContext => ({
  type: 'redaction',
  item,
  pageIndex: props.pageIndex,
});

// Placement hints (could be computed based on position)
const menuPlacement: SelectionMenuPlacement = {
  suggestTop: false,
  spaceAbove: 0,
  spaceBelow: 0,
};

// Render via function (for schema-driven approach)
const renderSelectionMenu = (
  item: RedactionItem,
  rect: Rect,
  menuWrapperProps: MenuWrapperProps,
): VNode | null => {
  if (!props.selectionMenu) return null;

  return props.selectionMenu({
    rect,
    menuWrapperProps,
    selected: selectedId.value === item.id,
    placement: menuPlacement,
    context: buildContext(item),
  });
};
</script>
