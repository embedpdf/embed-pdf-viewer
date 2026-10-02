<script setup lang="ts">
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
// The template reads `selected`, so it draws again on every selection change:
// the buttons follow what's selected.
const { selected } = useAnnotationState();
</script>

<template>
  <div class="toolbar">
    <button
      type="button"
      class="button"
      :disabled="selected.length === 0"
      @click="annotation.selection.rotateBy(-90)"
    >
      ↺ Turn left
    </button>
    <button
      type="button"
      class="button"
      :disabled="selected.length === 0"
      @click="annotation.selection.rotateBy(90)"
    >
      ↻ Turn right
    </button>
    <button
      type="button"
      class="button"
      :disabled="selected.length === 0"
      @click="annotation.selection.resetRotation()"
    >
      Upright
    </button>
    <span class="spacer" />
    <button
      type="button"
      class="button"
      :disabled="!annotation.selection.canGroup()"
      @click="annotation.selection.group()"
    >
      Group
    </button>
    <button
      type="button"
      class="button"
      :disabled="!annotation.selection.canUngroup()"
      @click="annotation.selection.ungroup()"
    >
      Ungroup
    </button>
  </div>
</template>
