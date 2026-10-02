<script setup lang="ts">
import { SearchLayer, useSearch } from '@embedpdf/vue/search';

const search = useSearch();
</script>

<template>
  <SearchLayer @hit-click="(hit) => search.goToHit(hit)" />
</template>
