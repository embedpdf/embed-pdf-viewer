<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue';
import type { StyleValue } from 'vue';

import { useScrollPlugin } from '../hooks';
import { ScrollStrategy, type ScrollerLayout, type PageLayout } from '@embedpdf/plugin-scroll';
import { useRegistry } from '@embedpdf/core/vue';
import type { PdfDocumentObject, Rotation } from '@embedpdf/models';

interface Props {
  documentId?: string;
  style?: StyleValue;
}

const props = defineProps<Props>();

const { plugin: scrollPlugin } = useScrollPlugin();
const { registry } = useRegistry();

const layout = ref<ScrollerLayout | null>(null);

const targetDocId = computed(() => props.documentId);

watchEffect((onCleanup) => {
  if (!scrollPlugin.value || !targetDocId.value) return;

  // Subscribe to scroller layout updates for this document
  const off = scrollPlugin.value.onScrollerData(targetDocId.value, (scrollerLayout) => {
    layout.value = scrollerLayout;
  });

  onCleanup(off);
});

onMounted(() => {
  if (scrollPlugin.value && targetDocId.value) {
    scrollPlugin.value.setLayoutReady(targetDocId.value);
  }
});

interface PageSlotProps extends PageLayout {
  rotation: Rotation;
  scale: number;
  document: PdfDocumentObject | null;
}

function pageSlotProps(pl: PageLayout): PageSlotProps {
  const core = registry.value!.getStore().getState().core;
  const coreDoc = core.documents[targetDocId.value!];

  return {
    ...pl,
    rotation: coreDoc.rotation,
    scale: coreDoc.scale,
    document: coreDoc.document,
  };
}

const rootStyle = computed<StyleValue>(() => {
  if (!layout.value) return props.style;

  const base =
    typeof props.style === 'object' && !Array.isArray(props.style)
      ? { ...props.style }
      : (props.style ?? {});

  return [
    base,
    {
      width: `${layout.value.totalWidth}px`,
      height: `${layout.value.totalHeight}px`,
      position: 'relative',
      boxSizing: 'border-box',
      margin: '0 auto',
      ...(layout.value.strategy === ScrollStrategy.Horizontal && {
        display: 'flex',
        flexDirection: 'row',
      }),
    },
  ];
});
</script>

<template>
  <div v-if="layout && registry" :style="rootStyle">
    <!-- leading spacer -->
    <div
      v-if="layout.strategy === 'horizontal'"
      :style="{ width: layout.startSpacing + 'px', height: '100%', flexShrink: 0 }"
    />
    <div v-else :style="{ height: layout.startSpacing + 'px', width: '100%' }" />

    <!-- page grid -->
    <div
      :style="{
        gap: layout.pageGap + 'px',
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        boxSizing: 'border-box',
        flexDirection: layout.strategy === 'horizontal' ? 'row' : 'column',
        minHeight: layout.strategy === 'horizontal' ? '100%' : undefined,
        minWidth: layout.strategy === 'vertical' ? 'fit-content' : undefined,
      }"
    >
      <template v-for="item in layout.items" :key="item.pageNumbers[0]">
        <div :style="{ display: 'flex', justifyContent: 'center', gap: layout.pageGap + 'px' }">
          <div
            v-for="pl in item.pageLayouts"
            :key="pl.pageNumber"
            :style="{ width: pl.rotatedWidth + 'px', height: pl.rotatedHeight + 'px' }"
          >
            <slot :page="pageSlotProps(pl)" />
          </div>
        </div>
      </template>
    </div>

    <!-- trailing spacer -->
    <div
      v-if="layout.strategy === 'horizontal'"
      :style="{ width: layout.endSpacing + 'px', height: '100%', flexShrink: 0 }"
    />
    <div v-else :style="{ height: layout.endSpacing + 'px', width: '100%' }" />
  </div>
</template>
