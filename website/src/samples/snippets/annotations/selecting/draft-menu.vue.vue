<script setup lang="ts">
import { AnnotationDraftMenu, useAnnotation } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
</script>

<template>
  <AnnotationDraftMenu v-slot="{ draft }">
    <button :disabled="!draft.canFinish" @click="annotation.draft.finish()">Done</button>
    <button @click="annotation.draft.cancel()">Cancel</button>
  </AnnotationDraftMenu>
</template>
