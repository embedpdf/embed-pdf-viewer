<script setup lang="ts">
import { Anchored } from '@embedpdf/vue/anchored';
import { useSearch, useSearchState } from '@embedpdf/vue/search';

// A button below the active match: it follows the match while you scroll and zoom.
const search = useSearch();
const { activeHit, activeHitIndex, hitCount } = useSearchState();
</script>

<template>
  <Anchored
    :anchor="activeHit && { page: activeHit.page, bounds: activeHit.bounds }"
    placement="bottom"
  >
    <button type="button" class="pill" @click="search.nextHit()">
      {{ activeHitIndex + 1 }} of {{ hitCount }} · Next →
    </button>
  </Anchored>
</template>
