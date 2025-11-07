<template>
  <div class="flex h-full w-80 flex-col border-l border-gray-300 bg-white">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-gray-300 px-4 py-3">
      <h2 class="text-lg font-semibold text-gray-800">Search</h2>
      <button
        @click="onClose"
        class="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        aria-label="Close search"
      >
        <CloseIcon class="h-5 w-5" />
      </button>
    </div>

    <!-- Search Input -->
    <div class="border-b border-gray-200 p-4">
      <div class="relative">
        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <SearchIcon class="h-5 w-5 text-gray-400" />
        </div>
        <input
          ref="inputRef"
          v-model="inputValue"
          type="text"
          placeholder="Search"
          class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          v-if="inputValue"
          @click="clearInput"
          class="absolute inset-y-0 right-0 flex items-center pr-3"
        >
          <CloseIcon class="h-4 w-4 text-gray-400 hover:text-gray-600" />
        </button>
      </div>

      <!-- Options -->
      <div class="mt-3 space-y-2">
        <label class="flex items-center text-sm text-gray-700">
          <input
            :checked="isMatchCaseChecked"
            @change="
              (e) => handleFlagChange(MatchFlag.MatchCase, (e.target as HTMLInputElement).checked)
            "
            type="checkbox"
            class="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Case sensitive
        </label>
        <label class="flex items-center text-sm text-gray-700">
          <input
            :checked="isWholeWordChecked"
            @change="
              (e) =>
                handleFlagChange(MatchFlag.MatchWholeWord, (e.target as HTMLInputElement).checked)
            "
            type="checkbox"
            class="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Whole word
        </label>
      </div>

      <!-- Results count and navigation -->
      <div
        v-if="state.active && !state.loading && state.total > 0"
        class="mt-3 flex items-center justify-between"
      >
        <span class="text-sm text-gray-600">{{ state.total }} results found</span>
        <div v-if="state.total > 1" class="flex gap-1">
          <button
            @click="provides?.previousResult()"
            class="rounded p-1 text-gray-600 hover:bg-gray-100"
            aria-label="Previous result"
          >
            <ChevronLeftIcon class="h-4 w-4" />
          </button>
          <button
            @click="provides?.nextResult()"
            class="rounded p-1 text-gray-600 hover:bg-gray-100"
            aria-label="Next result"
          >
            <ChevronRightIcon class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Results -->
    <div class="flex-1 overflow-auto p-4">
      <div v-if="state.loading" class="flex h-full items-center justify-center">
        <div class="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
      <div v-else class="space-y-4">
        <div v-for="(hits, page) in grouped" :key="page">
          <div class="mb-2 text-xs font-semibold text-gray-500">Page {{ Number(page) + 1 }}</div>
          <div class="space-y-2">
            <button
              v-for="{ hit, index } in hits"
              :key="index"
              @click="handleHitClick(index)"
              :class="[
                'w-full rounded border p-2 text-left text-sm transition-colors',
                index === state.activeResultIndex
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              ]"
            >
              <span>
                <template v-if="hit.context.truncatedLeft">… </template>
                {{ hit.context.before }}
                <span class="font-bold text-blue-600">{{ hit.context.match }}</span>
                {{ hit.context.after }}
                <template v-if="hit.context.truncatedRight"> …</template>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, nextTick } from 'vue';
import { useSearch } from '@embedpdf/plugin-search/vue';
import { useScrollCapability } from '@embedpdf/plugin-scroll/vue';
import { MatchFlag } from '@embedpdf/models';
import { SearchIcon, CloseIcon, ChevronRightIcon, ChevronLeftIcon } from './Icons.vue';

const props = defineProps<{
  documentId: string;
  onClose: () => void;
}>();

const { state, provides } = useSearch(() => props.documentId);
const { provides: scroll } = useScrollCapability();
const inputRef = ref<HTMLInputElement | null>(null);
const inputValue = ref(state.value.query || '');

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

const grouped = computed(() => {
  return state.value.results.reduce<
    Record<number, { hit: (typeof state.value.results)[0]; index: number }[]>
  >((map, r, i) => {
    (map[r.pageIndex] ??= []).push({ hit: r, index: i });
    return map;
  }, {});
});

const handleHitClick = (index: number) => {
  provides.value?.goToResult(index);
};

const isMatchCaseChecked = computed(() => state.value.flags.includes(MatchFlag.MatchCase));
const isWholeWordChecked = computed(() => state.value.flags.includes(MatchFlag.MatchWholeWord));
</script>
