<script setup lang="ts">
import { Anchored } from '@embedpdf/vue/anchored';
import { useAnnotationAnchor, useAnnotationState } from '@embedpdf/vue/annotation';

// A card next to the annotation under the pointer: who wrote it, and what.
const { hovered } = useAnnotationState(); // the annotation under the pointer, or null
const anchor = useAnnotationAnchor(() => hovered.value?.ref ?? null);
</script>

<template>
  <Anchored v-if="hovered?.contents" :anchor="anchor" placement="top">
    <div class="card">
      <strong>{{ hovered.author ?? 'Someone' }}</strong>
      <p>{{ hovered.contents }}</p>
    </div>
  </Anchored>
</template>
