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
          @pointerdown="(e) => select(e, item.id)"
          @touchstart="(e) => select(e, item.id)"
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
            left: `${item.boundingRect.origin.x * scale}px`,
            top: `${item.boundingRect.origin.y * scale}px`,
            width: `${item.boundingRect.size.width * scale}px`,
            height: `${item.boundingRect.size.height * scale}px`,
            background: 'transparent',
            outline: selectedId === item.id ? `1px solid ${bboxStroke}` : 'none',
            outlineOffset: '2px',
            pointerEvents: 'auto',
            cursor: selectedId === item.id ? 'pointer' : 'default',
          }"
        >
          <Highlight
            :rect="item.boundingRect"
            :rects="item.rects"
            color="transparent"
            border="1px solid red"
            :scale="scale"
            :on-click="(e) => select(e, item.id)"
          />
        </div>
        <CounterRotate
          :rect="{
            origin: {
              x: item.boundingRect.origin.x * scale,
              y: item.boundingRect.origin.y * scale,
            },
            size: {
              width: item.boundingRect.size.width * scale,
              height: item.boundingRect.size.height * scale,
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
import { ref, onMounted, onUnmounted } from 'vue';
import { CounterRotate } from '@embedpdf/utils/vue';
import type { Rotation } from '@embedpdf/models';
import type { RedactionItem } from '@embedpdf/plugin-redaction';
import { useRedactionCapability } from '../hooks/use-redaction';
import Highlight from './highlight.vue';

interface PendingRedactionsProps {
  pageIndex: number;
  scale: number;
  rotation?: Rotation;
  bboxStroke?: string;
}

const props = withDefaults(defineProps<PendingRedactionsProps>(), {
  rotation: 0,
  bboxStroke: 'rgba(0,0,0,0.8)',
});

const { provides: redaction } = useRedactionCapability();
const items = ref<RedactionItem[]>([]);
const selectedId = ref<string | null>(null);

const select = (e: PointerEvent | TouchEvent, id: string) => {
  e.stopPropagation();
  if (!redaction.value) return;
  redaction.value.selectPending(props.pageIndex, id);
};

let unsubscribePending: (() => void) | undefined;
let unsubscribeSelection: (() => void) | undefined;

onMounted(() => {
  if (!redaction.value) return;

  unsubscribePending = redaction.value.onPendingChange((map) => {
    items.value = map[props.pageIndex] ?? [];
  });

  unsubscribeSelection = redaction.value.onSelectionChange((sel) => {
    selectedId.value = sel && sel.page === props.pageIndex ? sel.id : null;
  });
});

onUnmounted(() => {
  unsubscribePending?.();
  unsubscribeSelection?.();
});
</script>
