<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AnchoredPlacement, AnchoredSide } from '@embedpdf/vue/anchored';
import { RenderLayer } from '@embedpdf/vue/render';
import { SearchLayer, useSearch } from '@embedpdf/vue/search';
import { Stage } from '@embedpdf/vue/stage';
import MatchCard from './MatchCard.vue';

const SIDES: AnchoredSide[] = ['top', 'right', 'bottom', 'left'];
const ALIGNS = ['start', 'center', 'end'] as const;

const search = useSearch();
const side = ref<AnchoredSide>('top');
const align = ref<(typeof ALIGNS)[number]>('center');
const gap = ref(8);
const pinned = ref(false);
const placement = computed(
  (): AnchoredPlacement => (align.value === 'center' ? side.value : `${side.value}-${align.value}`),
);

void search.search({ text: 'PDF' }).then(() => search.revealActiveHit());
</script>

<template>
  <div class="toolbar">
    <div class="segmented" role="radiogroup" aria-label="Side">
      <button
        v-for="each in SIDES"
        :key="each"
        type="button"
        role="radio"
        :aria-checked="each === side"
        class="segment"
        @click="side = each"
      >
        {{ each }}
      </button>
    </div>
    <div class="segmented" role="radiogroup" aria-label="Along the side">
      <button
        v-for="each in ALIGNS"
        :key="each"
        type="button"
        role="radio"
        :aria-checked="each === align"
        class="segment"
        @click="align = each"
      >
        {{ each }}
      </button>
    </div>
    <label class="range">
      Gap {{ gap }} px
      <input v-model.number="gap" type="range" :min="-24" :max="32" />
    </label>
    <label class="switch">
      <input v-model="pinned" type="checkbox" />
      Pinned
    </label>
  </div>
  <Stage class="stage">
    <template #page>
      <RenderLayer />
      <SearchLayer />
    </template>
    <template #overlay>
      <MatchCard :placement="placement" :gap="gap" :pinned="pinned" />
    </template>
  </Stage>
</template>
