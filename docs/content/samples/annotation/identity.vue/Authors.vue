<script setup lang="ts">
import { annotationKey, useAnnotationList } from '@embedpdf/vue/annotation';

// Who wrote each annotation, and when: the engine fills these in from the identity.
const annotations = useAnnotationList();

const time = (date: string | null) =>
  date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
</script>

<template>
  <ul class="panel authors">
    <li v-if="annotations.length === 0" class="empty">Draw something</li>
    <li v-for="annotation in annotations" :key="annotationKey(annotation.ref)" class="author">
      <span class="kind">{{ annotation.subtype }}</span>
      <span>{{ annotation.author ?? 'Nobody' }} · {{ time(annotation.createdAt) }}</span>
    </li>
  </ul>
</template>
