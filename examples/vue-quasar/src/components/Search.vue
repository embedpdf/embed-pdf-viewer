<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useSearch } from '@embedpdf/plugin-search/vue';
import { useScrollCapability } from '@embedpdf/plugin-scroll/vue';
import { MatchFlag } from '@embedpdf/models';
import type { SearchResult } from '@embedpdf/models';
import type { QInput } from 'quasar';

const { state, provides } = useSearch();
const { provides: scroll } = useScrollCapability();

const inputValue = ref(state.value.query || '');
const inputRef = ref<QInput | null>(null);

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
  <div class="search-container column fit">
    <!-- Search Input -->
    <div class="q-pa-md column q-gutter-md">
      <q-input
        ref="inputRef"
        v-model="inputValue"
        placeholder="Search"
        dense
        outlined
        clearable
        autocomplete="off"
        @clear="clearInput"
      >
        <template #prepend>
          <q-icon name="mdi-magnify" />
        </template>
      </q-input>

      <!-- Search Options -->
      <div class="column q-gutter-xs">
        <q-checkbox
          :model-value="isMatchCaseChecked"
          dense
          label="Case sensitive"
          @update:model-value="(checked) => handleFlagChange(MatchFlag.MatchCase, !!checked)"
        />
        <q-checkbox
          :model-value="isWholeWordChecked"
          dense
          label="Whole word"
          @update:model-value="(checked) => handleFlagChange(MatchFlag.MatchWholeWord, !!checked)"
        />
      </div>

      <q-separator />

      <!-- Results Summary -->
      <div
        v-if="state.active && !state.loading"
        class="row items-center justify-between text-body2"
      >
        <q-chip dense color="primary" outline size="sm">
          {{ state.total }} results found
        </q-chip>
        <div v-if="state.total > 1" class="row items-center q-gutter-xs">
          <q-btn
            flat
            round
            dense
            icon="mdi-chevron-up"
            @click="provides?.previousResult()"
          />
          <q-btn
            flat
            round
            dense
            icon="mdi-chevron-down"
            @click="provides?.nextResult()"
          />
        </div>
      </div>
    </div>

    <!-- Results List -->
    <div class="results-list col scroll q-px-md q-pb-md">
      <div v-if="state.loading" class="column items-center justify-center q-gutter-sm">
        <q-spinner size="24px" color="primary" />
        <div class="text-caption text-grey-7">Searching…</div>
      </div>
      <div v-else>
        <div v-for="[page, hits] in Object.entries(grouped)" :key="page" class="q-mb-md">
          <div class="text-caption text-grey-7 q-mb-sm">Page {{ Number(page) + 1 }}</div>
          <div class="column q-gutter-sm">
            <q-card
              v-for="{ hit, index } in hits"
              :key="index"
              clickable
              flat
              bordered
              :class="[
                'search-result-card',
                index === state.activeResultIndex ? 'search-result-card--active' : '',
              ]"
              @click="handleHitClick(index)"
            >
              <q-card-section class="q-pa-sm">
                <div class="text-body2">
                  <span v-if="hit.context.truncatedLeft">… </span>
                  <span>{{ hit.context.before }}</span>
                  <span class="text-primary text-weight-medium">{{ hit.context.match }}</span>
                  <span>{{ hit.context.after }}</span>
                  <span v-if="hit.context.truncatedRight"> …</span>
                </div>
              </q-card-section>
            </q-card>
          </div>
        </div>
        <div v-if="!state.total" class="text-caption text-grey-6">
          No matches yet — start typing to search the document.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-container {
  min-height: 0;
}

.results-list {
  min-height: 0;
}

.search-result-card {
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.search-result-card:hover {
  transform: translateY(-1px);
  border-color: rgba(0, 0, 0, 0.2);
}

.search-result-card--active {
  border-color: var(--q-primary);
  background-color: rgba(17, 132, 255, 0.08);
}
</style>
