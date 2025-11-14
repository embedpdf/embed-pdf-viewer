<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useSearch } from '@embedpdf/plugin-search/vue';
import { useScrollCapability } from '@embedpdf/plugin-scroll/vue';
import { MatchFlag } from '@embedpdf/models';
import type { SearchResult } from '@embedpdf/models';

interface SearchProps {
  documentId: string;
}

const props = defineProps<SearchProps>();

const { state, provides } = useSearch(() => props.documentId);
const { provides: scroll } = useScrollCapability();

const inputValue = ref(state.value.query || '');
const inputRef = ref<HTMLInputElement>();

// Focus input when component mounts
onMounted(async () => {
  await nextTick();
  inputRef.value?.focus();
  inputValue.value = state.value.query || '';
});

// Watch for input changes and trigger search
watch(inputValue, (newValue) => {
  if (newValue === '') {
    provides.value?.stopSearch();
  } else {
    provides.value?.searchAllPages(newValue);
  }
});

// Auto-scroll to active result when it changes
watch(
  () => [state.value.activeResultIndex, state.value.loading, state.value.query, state.value.flags],
  ([activeIndex]) => {
    if (typeof activeIndex === 'number' && !state.value.loading) {
      scrollToItem(activeIndex);
    }
  },
);

const handleFlagChange = (flag: MatchFlag, checked: boolean) => {
  const currentFlags = state.value.flags;
  if (checked) {
    provides.value?.setFlags([...currentFlags, flag]);
  } else {
    provides.value?.setFlags(currentFlags.filter((f) => f !== flag));
  }
};

const clearInput = () => {
  inputValue.value = '';
  inputRef.value?.focus();
};

const scrollToItem = (index: number) => {
  const item = state.value.results[index];
  if (!item) return;

  const minCoordinates = item.rects.reduce(
    (min, rect) => ({
      x: Math.min(min.x, rect.origin.x),
      y: Math.min(min.y, rect.origin.y),
    }),
    { x: Infinity, y: Infinity },
  );

  scroll.value?.scrollToPage({
    pageNumber: item.pageIndex + 1,
    pageCoordinates: minCoordinates,
    center: true,
  });
};

const groupByPage = (results: SearchResult[]) => {
  return results.reduce<Record<number, { hit: SearchResult; index: number }[]>>((map, r, i) => {
    (map[r.pageIndex] ??= []).push({ hit: r, index: i });
    return map;
  }, {});
};

const grouped = computed(() => groupByPage(state.value.results));

const handleHitClick = (index: number) => {
  provides.value?.goToResult(index);
};

const isMatchCaseChecked = computed(() => state.value.flags.includes(MatchFlag.MatchCase));

const isWholeWordChecked = computed(() => state.value.flags.includes(MatchFlag.MatchWholeWord));
</script>

<template>
  <div class="search-container d-flex flex-column fill-height">
    <!-- Search Input -->
    <div class="pa-3">
      <v-text-field
        ref="inputRef"
        v-model="inputValue"
        placeholder="Search"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        @click:clear="clearInput"
      />

      <!-- Search Options -->
      <div class="mt-3">
        <v-checkbox
          :model-value="isMatchCaseChecked"
          @update:model-value="(checked) => handleFlagChange(MatchFlag.MatchCase, !!checked)"
          label="Case sensitive"
          density="compact"
          hide-details
        />
        <v-checkbox
          :model-value="isWholeWordChecked"
          @update:model-value="(checked) => handleFlagChange(MatchFlag.MatchWholeWord, !!checked)"
          label="Whole word"
          density="compact"
          hide-details
        />
      </div>

      <v-divider class="my-3" />

      <!-- Results Summary -->
      <div v-if="state.active && !state.loading" class="d-flex align-center justify-space-between">
        <v-chip size="small" variant="text" color="primary">
          {{ state.total }} results found
        </v-chip>
        <div v-if="state.total > 1" class="d-flex ga-1">
          <v-btn
            icon="mdi-chevron-up"
            variant="text"
            size="small"
            @click="provides?.previousResult()"
          />
          <v-btn
            icon="mdi-chevron-down"
            variant="text"
            size="small"
            @click="provides?.nextResult()"
          />
        </div>
      </div>
    </div>

    <!-- Results List -->
    <div class="flex-1-1-100 overflow-y-auto px-3 pb-3">
      <div v-if="state.loading" class="d-flex align-center fill-height justify-center">
        <v-progress-circular indeterminate size="24" />
      </div>
      <div v-else>
        <div v-for="[page, hits] in Object.entries(grouped)" :key="page" class="mb-4">
          <v-subheader class="text-caption text-medium-emphasis px-0">
            Page {{ Number(page) + 1 }}
          </v-subheader>

          <div class="d-flex flex-column ga-2">
            <v-card
              v-for="{ hit, index } in hits"
              :key="index"
              :variant="index === state.activeResultIndex ? 'tonal' : 'outlined'"
              :color="index === state.activeResultIndex ? 'primary' : undefined"
              class="search-result-card"
              @click="handleHitClick(index)"
            >
              <v-card-text class="pa-3">
                <div class="text-body-2">
                  <span v-if="hit.context.truncatedLeft">… </span>
                  <span>{{ hit.context.before }}</span>
                  <span class="font-weight-bold text-primary">{{ hit.context.match }}</span>
                  <span>{{ hit.context.after }}</span>
                  <span v-if="hit.context.truncatedRight"> …</span>
                </div>
              </v-card-text>
            </v-card>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-container {
  height: 100%;
}

.search-result-card {
  cursor: pointer;
  transition: all 0.2s ease;
}

.search-result-card:hover {
  transform: translateY(-1px);
}

.flex-1-1-100 {
  flex: 1 1 100%;
}
</style>
