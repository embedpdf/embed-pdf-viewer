<!-- Every thread in the document, in reading order. -->
<script setup lang="ts">
import { annotationKey, useAnnotationState, useCommentThreads } from '@embedpdf/vue/annotation';
import Thread from './Thread.vue';

const threads = useCommentThreads();
const loading = useAnnotationState((state) => state.status === 'loading');
</script>

<template>
  <div class="panel threads">
    <p v-if="loading" class="empty">Loading comments…</p>
    <p v-if="!loading && threads.length === 0" class="empty">No comments</p>
    <Thread v-for="thread in threads" :key="annotationKey(thread.root.ref)" :thread="thread" />
  </div>
</template>
