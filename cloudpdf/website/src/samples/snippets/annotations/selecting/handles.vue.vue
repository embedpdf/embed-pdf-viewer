<script setup lang="ts">
import { AnnotationLayer } from '@embedpdf/vue/annotation';
</script>

<template>
  <AnnotationLayer>
    <template #handle="{ at, size, rotation }">
      <div
        class="my-handle"
        :style="{
          left: `${at.x - size / 2}px`,
          top: `${at.y - size / 2}px`,
          width: `${size}px`,
          height: `${size}px`,
          rotate: `${rotation}deg`,
        }"
      />
    </template>
    <!-- #rotation-handle works the same way -->
  </AnnotationLayer>
</template>
