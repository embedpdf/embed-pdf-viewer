<script setup lang="ts">
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';

// Your own data: points in page coordinates, by the page's object number.
const pins = new Map<number, { x: number; y: number }[]>();
</script>

<template>
  <Stage>
    <template #page="{ page }">
      <RenderLayer />
      <!-- page coordinates → pixels on this page, at its zoom; the page turns them with it -->
      <div
        v-for="(point, index) in pins.get(page.ref.objectNumber) ?? []"
        :key="index"
        :style="{
          position: 'absolute',
          left: `${page.transform.toPixels(point).x}px`,
          top: `${page.transform.toPixels(point).y}px`,
        }"
      >
        📌
      </div>
    </template>
  </Stage>
</template>
