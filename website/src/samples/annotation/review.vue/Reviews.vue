<script setup lang="ts">
import { annotationKey, useCommentThreads } from '@embedpdf/vue/annotation';
import Review from './Review.vue';

const threads = useCommentThreads();
</script>

<template>
  <div class="panel threads">
    <p v-if="threads.length === 0" class="empty">No comments</p>
    <Review v-for="thread in threads" :key="annotationKey(thread.root.ref)" :thread="thread" />
  </div>
</template>
