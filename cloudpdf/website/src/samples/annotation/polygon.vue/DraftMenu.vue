<script setup lang="ts">
import { AnnotationDraftMenu, useAnnotation } from '@embedpdf/vue/annotation';

// Done and Cancel next to the shape being drawn, for touch screens.
const annotation = useAnnotation();
</script>

<template>
  <AnnotationDraftMenu v-slot="{ draft }">
    <div class="menu" role="toolbar" aria-label="Shape">
      <button type="button" :disabled="!draft.canFinish" @click="annotation.draft.finish()">
        Done
      </button>
      <button type="button" @click="annotation.draft.cancel()">Cancel</button>
    </div>
  </AnnotationDraftMenu>
</template>
