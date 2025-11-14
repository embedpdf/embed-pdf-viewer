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
        <CounterRotate
          :rect="{
            origin: { x: item.rect.origin.x * scale, y: item.rect.origin.y * scale },
            size: { width: item.rect.size.width * scale, height: item.rect.size.height * scale },
          }"
          :rotation="rotation"
        >
          <template #default="{ rect, menuWrapperProps }">
            <slot
              name="selection-menu"
              :item="item"
              :selected="selectedId === item.id"
              :page-index="pageIndex"
              :menu-wrapper-props="menuWrapperProps"
              :rect="rect"
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
        <CounterRotate
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
            <slot
              name="selection-menu"
              :item="item"
              :selected="selectedId === item.id"
              :page-index="pageIndex"
              :menu-wrapper-props="menuWrapperProps"
              :rect="rect"
            />
          </template>
        </CounterRotate>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { CounterRotate } from '@embedpdf/utils/vue';
import { Rotation } from '@embedpdf/models';
import type { RedactionItem } from '@embedpdf/plugin-redaction';
import { useRedactionCapability } from '../hooks/use-redaction';
import Highlight from './highlight.vue';

interface PendingRedactionsProps {
  documentId: string;
  pageIndex: number;
  scale: number;
  rotation: Rotation;
  bboxStroke?: string;
}

const props = withDefaults(defineProps<PendingRedactionsProps>(), {
  rotation: Rotation.Degree0,
  bboxStroke: 'rgba(0,0,0,0.8)',
});

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

    // Use document-scoped hooks so we only receive events for this document
    const scoped = redactionValue.forDocument(docId);

    // Initialize with current state
    const currentState = scoped.getState();
    items.value = currentState.pending[pageIdx] ?? [];
    selectedId.value =
      currentState.selected && currentState.selected.page === pageIdx
        ? currentState.selected.id
        : null;

    // Subscribe to future changes
    const off1 = scoped.onPendingChange((map) => {
      items.value = map[pageIdx] ?? [];
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
</script>
