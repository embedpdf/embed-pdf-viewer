<script setup lang="ts">
import { annotationKey, useCommentThreads } from '@embedpdf/vue/annotation';
import { useStage } from '@embedpdf/vue/stage';

const threads = useCommentThreads();
const stage = useStage();
</script>

<template>
  <button
    v-for="thread in threads"
    :key="annotationKey(thread.root.ref)"
    @click="stage.reveal(thread.page, { rect: thread.root.rect })"
  >
    {{ thread.root.contents }}, page {{ thread.pageLabel }}
  </button>
</template>
