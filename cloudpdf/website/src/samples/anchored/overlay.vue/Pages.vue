<script setup lang="ts">
import { RenderLayer } from '@embedpdf/vue/render';
import { SearchLayer, useSearch } from '@embedpdf/vue/search';
import { Stage } from '@embedpdf/vue/stage';
import NextMatch from './NextMatch.vue';

const search = useSearch();

// Every "PDF" in the document, and the view on the first one.
void search.search({ text: 'PDF' }).then(() => search.revealActiveHit());
</script>

<template>
  <Stage class="stage">
    <template #page>
      <RenderLayer />
      <SearchLayer />
    </template>
    <template #overlay>
      <NextMatch />
    </template>
  </Stage>
</template>
