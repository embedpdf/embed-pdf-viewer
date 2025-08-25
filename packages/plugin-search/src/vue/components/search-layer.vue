<template>
  <div v-if="searchResultState" v-bind="$attrs">
    <div v-for="({ result, originalIndex }, idx) in pageResults" :key="`result-${idx}`">
      <div
        v-for="(rect, rectIdx) in result.rects"
        :key="`rect-${idx}-${rectIdx}`"
        :style="{
          position: 'absolute',
          top: `${rect.origin.y * scale}px`,
          left: `${rect.origin.x * scale}px`,
          width: `${rect.size.width * scale}px`,
          height: `${rect.size.height * scale}px`,
          backgroundColor:
            originalIndex === searchResultState.activeResultIndex
              ? activeHighlightColor
              : highlightColor,
          mixBlendMode: 'multiply',
          transform: 'scale(1.02)',
          transformOrigin: 'center',
          transition: 'opacity .3s ease-in-out',
          opacity: 1,
        }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { SearchResultState } from '@embedpdf/plugin-search';
import { useSearchCapability } from '../hooks/use-search';

interface SearchLayerProps {
  pageIndex: number;
  scale: number;
  highlightColor?: string;
  activeHighlightColor?: string;
}

const props = withDefaults(defineProps<SearchLayerProps>(), {
  highlightColor: '#FFFF00',
  activeHighlightColor: '#FFBF00',
});

const { provides: searchProvides } = useSearchCapability();
const searchResultState = ref<SearchResultState | null>(null);

// Filter results for current page while preserving original indices
const pageResults = computed(() => {
  if (!searchResultState.value) return [];

  return searchResultState.value.results
    .map((result, originalIndex) => ({ result, originalIndex }))
    .filter(({ result }) => result.pageIndex === props.pageIndex);
});

let unsubscribe: (() => void) | undefined;

onMounted(() => {
  if (!searchProvides.value) return;

  unsubscribe = searchProvides.value.onSearchResultStateChange((state) => {
    searchResultState.value = state;
  });
});

onUnmounted(() => {
  unsubscribe?.();
});
</script>
