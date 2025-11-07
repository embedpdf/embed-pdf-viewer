<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import type { SearchResultState } from '@embedpdf/plugin-search';
import { useSearchCapability } from '../hooks/use-search';

interface SearchLayerProps {
  documentId: string;
  pageIndex: number;
  scale?: number;
  highlightColor?: string;
  activeHighlightColor?: string;
}

const props = withDefaults(defineProps<SearchLayerProps>(), {
  highlightColor: '#FFFF00',
  activeHighlightColor: '#FFBF00',
});

const { provides: searchProvides } = useSearchCapability();
const documentState = useDocumentState(() => props.documentId);
const searchResultState = ref<SearchResultState | null>(null);

const scope = computed(() => searchProvides.value?.forDocument(props.documentId) ?? null);

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

watch(
  scope,
  (scopeValue, _, onCleanup) => {
    if (!scopeValue) {
      searchResultState.value = null;
      return;
    }

    // Set initial state
    const currentState = scopeValue.getState();
    searchResultState.value = {
      results: currentState.results,
      activeResultIndex: currentState.activeResultIndex,
      showAllResults: currentState.showAllResults,
      active: currentState.active,
    };

    // Subscribe to changes
    const unsubscribe = scopeValue.onSearchResultStateChange((state) => {
      searchResultState.value = state;
    });

    onCleanup(unsubscribe);
  },
  { immediate: true },
);

// Filter results for current page while preserving original indices
const pageResults = computed(() => {
  if (!searchResultState.value) return [];

  return searchResultState.value.results
    .map((result, originalIndex) => ({ result, originalIndex }))
    .filter(({ result }) => result.pageIndex === props.pageIndex);
});

// Decide which results to show
const resultsToShow = computed(() => {
  if (!searchResultState.value) return [];

  return pageResults.value.filter(
    ({ originalIndex }) =>
      searchResultState.value!.showAllResults ||
      originalIndex === searchResultState.value!.activeResultIndex,
  );
});
</script>

<template>
  <div
    v-if="searchResultState && searchResultState.active"
    :style="{
      pointerEvents: 'none',
    }"
    v-bind="$attrs"
  >
    <template v-for="({ result, originalIndex }, idx) in resultsToShow" :key="`result-${idx}`">
      <div
        v-for="(rect, rectIdx) in result.rects"
        :key="`rect-${idx}-${rectIdx}`"
        :style="{
          position: 'absolute',
          top: `${rect.origin.y * actualScale}px`,
          left: `${rect.origin.x * actualScale}px`,
          width: `${rect.size.width * actualScale}px`,
          height: `${rect.size.height * actualScale}px`,
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
    </template>
  </div>
</template>
