<script setup lang="ts">
import { RenderLayer } from '@embedpdf/vue/render';
import { SearchLayer, useSearch } from '@embedpdf/vue/search';
import { Stage } from '@embedpdf/vue/stage';

const search = useSearch();
</script>

<template>
  <Stage class="stage">
    <template #page>
      <RenderLayer />
      <SearchLayer @hit-click="(hit) => search.goToHit(hit)" />
    </template>
  </Stage>
</template>
