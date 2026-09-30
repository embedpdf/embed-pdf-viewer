<script setup lang="ts">
import { annotationKey, useCommentThreads } from '@embedpdf/vue/annotation';

const threads = useCommentThreads();
</script>

<template>
  <article v-for="thread in threads" :key="annotationKey(thread.root.ref)">
    <p>{{ thread.root.author }}, page {{ thread.pageLabel }}: {{ thread.root.contents }}</p>
    <p v-for="reply in thread.replies" :key="annotationKey(reply.ref)">
      {{ reply.author }}: {{ reply.contents }}
    </p>
  </article>
</template>
