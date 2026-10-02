<script setup lang="ts">
import { computed } from 'vue';
import {
  AnnotationLayer,
  AnnotationMenu,
  useAnnotation,
  useAnnotationState,
} from '@embedpdf/vue/annotation';
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';

const annotation = useAnnotation();
const { selected } = useAnnotationState();
const allText = computed(() => selected.value.every((a) => a.subtype === 'free-text'));
</script>

<template>
  <Stage>
    <template #page>
      <RenderLayer :annotations="false" />
      <AnnotationLayer />
    </template>

    <template #overlay>
      <AnnotationMenu placement="bottom">
        <div class="menu">
          <button v-if="allText" @click="annotation.text.toggleFormat('bold')">Bold</button>
          <button @click="annotation.selection.update({ color: '#dc143c' })">Red</button>
          <button @click="annotation.selection.delete()">Delete</button>
        </div>
      </AnnotationMenu>
    </template>
  </Stage>
</template>
