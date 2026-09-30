<script setup lang="ts">
import { watch } from 'vue';
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage, useStage, useStageState } from '@embedpdf/vue/stage';
import { ThumbsToken } from './thumbnail-strip-token';

const main = useStage();
const thumbs = useStage(ThumbsToken);
const { currentPageIndex } = useStageState();

// Keep the current page's thumbnail in view as the reader moves
watch(currentPageIndex, (index) => thumbs.reveal(index), { immediate: true });
</script>

<template>
  <Stage :token="ThumbsToken" :interaction="false" :zoom-gestures="false">
    <template #page="{ page }">
      <button
        :aria-current="page.pageIndex === currentPageIndex"
        @click="main.goToPage(page.ref)"
      >
        <RenderLayer />
      </button>
    </template>
    <template #page-chrome="{ page }">
      <span class="label">{{ page.pageIndex + 1 }}</span>
    </template>
  </Stage>
</template>
