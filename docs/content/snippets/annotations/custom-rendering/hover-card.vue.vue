<!-- StampCard.vue, for the Stage's #overlay slot -->
<script setup lang="ts">
import { Anchored } from '@embedpdf/vue/anchored';
import { useAnnotationAnchor, useAnnotationState } from '@embedpdf/vue/annotation';

const { hovered } = useAnnotationState(); // the annotation under the pointer, or null
const anchor = useAnnotationAnchor(() => hovered.value?.ref ?? null);
</script>

<template>
  <Anchored v-if="hovered?.subtype === 'stamp'" :anchor placement="top">
    <div class="card">Approved by {{ hovered.author }}</div>
  </Anchored>
</template>
