<script setup lang="ts">
import { computed } from 'vue';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// What's in the menu depends on what's selected: text boxes get Bold and Edit.
const annotation = useAnnotation();
const { selected } = useAnnotationState();
const allText = computed(() => selected.value.every((a) => a.subtype === 'free-text'));
const first = computed(() => selected.value[0]);
</script>

<template>
  <div class="menu" role="toolbar" aria-label="Selection">
    <button v-if="allText" type="button" @click="annotation.text.toggleFormat('bold')">Bold</button>
    <button
      v-if="allText && selected.length === 1 && first"
      type="button"
      @click="annotation.text.begin(first.ref)"
    >
      Edit text
    </button>
    <button type="button" @click="annotation.selection.update({ color: '#dc143c' })">Red</button>
    <button type="button" @click="annotation.selection.delete()">Delete</button>
  </div>
</template>
