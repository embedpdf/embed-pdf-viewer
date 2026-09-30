<script setup lang="ts">
import { useSearch, useSearchHits } from '@embedpdf/vue/search';

const search = useSearch();
const hits = useSearchHits();
</script>

<template>
  <ol>
    <li v-for="(hit, index) in hits" :key="index">
      <button type="button" @click="search.goToHit(index)">
        Page {{ hit.pageIndex + 1 }}: …{{ hit.snippet?.before }}
        <mark>{{ hit.snippet?.match }}</mark>
        {{ hit.snippet?.after }}…
      </button>
    </li>
  </ol>
</template>
