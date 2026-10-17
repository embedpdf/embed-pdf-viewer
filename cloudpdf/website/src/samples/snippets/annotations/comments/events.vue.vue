<script setup lang="ts">
import { useAnnotationEvent } from '@embedpdf/vue/annotation';
import { notifyThreadAuthor } from './notifications'; // your own

useAnnotationEvent(
  (annotation) => annotation.comments.onThreadChanged,
  ({ rootRef, change }) => change === 'reply' && notifyThreadAuthor(rootRef),
);
</script>

<template>
  <aside><!-- … --></aside>
</template>
