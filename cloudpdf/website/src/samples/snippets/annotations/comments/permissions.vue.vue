<script setup lang="ts">
import { useComments, type CommentThread } from '@embedpdf/vue/annotation';

const { thread } = defineProps<{ thread: CommentThread }>();
const comments = useComments();
</script>

<template>
  <button :disabled="!comments.canReply(thread.root.ref)">Reply</button>
  <button :disabled="!comments.canDeleteThread(thread.root.ref)">Delete thread</button>
</template>
