<script setup lang="ts">
import { useStage, useStageState } from '@embedpdf/vue/stage';

const stage = useStage();
const { currentPageIndex, pageCount } = useStageState();
</script>

<template>
  <nav>
    <button @click="stage.previousPage()">Previous</button>
    <span>{{ currentPageIndex + 1 }} of {{ pageCount }}</span>
    <button @click="stage.nextPage()">Next</button>
  </nav>
</template>
