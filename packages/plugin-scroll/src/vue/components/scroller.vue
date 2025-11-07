<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useScrollPlugin } from '../hooks';
import { ScrollStrategy, type ScrollerLayout } from '@embedpdf/plugin-scroll';

interface ScrollerProps {
  documentId: string;
}

const props = defineProps<ScrollerProps>();

const { plugin: scrollPlugin } = useScrollPlugin();

const layoutData = ref<{
  layout: ScrollerLayout | null;
  docId: string | null;
}>({ layout: null, docId: null });

watch(
  [scrollPlugin, () => props.documentId],
  ([plugin, docId], _, onCleanup) => {
    if (!plugin || !docId) {
      layoutData.value = { layout: null, docId: null };
      return;
    }

    // Subscribe to the new document
    const unsubscribe = plugin.onScrollerData(docId, (newLayout) => {
      layoutData.value = { layout: newLayout, docId };
    });

    onCleanup(() => {
      unsubscribe();
      layoutData.value = { layout: null, docId: null };
      plugin.clearLayoutReady(docId);
    });
  },
  {
    immediate: true,
  },
);

// Only use layout if it matches the current documentId (prevents stale data)
const scrollerLayout = computed(() => {
  return layoutData.value.docId === props.documentId ? layoutData.value.layout : null;
});

// Call setLayoutReady after layout is rendered (Vue's equivalent to useLayoutEffect)
watch(
  [scrollPlugin, () => props.documentId, scrollerLayout],
  ([plugin, docId, layout]) => {
    if (!plugin || !docId || !layout) return;

    plugin.setLayoutReady(docId);
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-if="scrollerLayout"
    :style="{
      width: `${scrollerLayout.totalWidth}px`,
      height: `${scrollerLayout.totalHeight}px`,
      position: 'relative',
      boxSizing: 'border-box',
      margin: '0 auto',
      ...(scrollerLayout.strategy === ScrollStrategy.Horizontal && {
        display: 'flex',
        flexDirection: 'row',
      }),
    }"
    v-bind="$attrs"
  >
    <!-- Leading spacer -->
    <div
      :style="
        scrollerLayout.strategy === ScrollStrategy.Horizontal
          ? {
              width: `${scrollerLayout.startSpacing}px`,
              height: '100%',
              flexShrink: 0,
            }
          : {
              height: `${scrollerLayout.startSpacing}px`,
              width: '100%',
            }
      "
    />

    <!-- Page grid -->
    <div
      :style="{
        gap: `${scrollerLayout.pageGap}px`,
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        boxSizing: 'border-box',
        ...(scrollerLayout.strategy === ScrollStrategy.Horizontal
          ? {
              flexDirection: 'row',
              minHeight: '100%',
            }
          : {
              flexDirection: 'column',
              minWidth: 'fit-content',
            }),
      }"
    >
      <div
        v-for="item in scrollerLayout.items"
        :key="item.pageNumbers[0]"
        :style="{
          display: 'flex',
          justifyContent: 'center',
          gap: `${scrollerLayout.pageGap}px`,
        }"
      >
        <div
          v-for="layout in item.pageLayouts"
          :key="layout.pageNumber"
          :style="{
            width: `${layout.rotatedWidth}px`,
            height: `${layout.rotatedHeight}px`,
          }"
        >
          <slot :page="layout" />
        </div>
      </div>
    </div>

    <!-- Trailing spacer -->
    <div
      :style="
        scrollerLayout.strategy === ScrollStrategy.Horizontal
          ? {
              width: `${scrollerLayout.endSpacing}px`,
              height: '100%',
              flexShrink: 0,
            }
          : {
              height: `${scrollerLayout.endSpacing}px`,
              width: '100%',
            }
      "
    />
  </div>
</template>
