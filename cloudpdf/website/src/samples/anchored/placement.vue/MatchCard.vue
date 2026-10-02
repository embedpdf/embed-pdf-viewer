<script setup lang="ts">
import { Anchored } from '@embedpdf/vue/anchored';
import type { AnchoredPlacement } from '@embedpdf/vue/anchored';
import { useSearch, useSearchState } from '@embedpdf/vue/search';

// A card next to the active match, where you put it, `gap` pixels away.
defineProps<{ placement: AnchoredPlacement; gap: number; pinned: boolean }>();

const search = useSearch();
const { activeHit, activeHitIndex, hitCount } = useSearchState();
</script>

<template>
  <Anchored
    :anchor="activeHit && { page: activeHit.page, bounds: activeHit.bounds }"
    :placement="placement"
    :gap="gap"
    :pinned="pinned"
  >
    <div class="card">
      <span class="card-title">Match {{ activeHitIndex + 1 }} of {{ hitCount }}</span>
      <span class="card-page">Page {{ (activeHit?.pageIndex ?? 0) + 1 }}</span>
      <div class="card-steps">
        <button
          type="button"
          class="step"
          aria-label="Previous match"
          @click="search.previousHit()"
        >
          ←
        </button>
        <button type="button" class="step" aria-label="Next match" @click="search.nextHit()">
          →
        </button>
      </div>
    </div>
  </Anchored>
</template>
