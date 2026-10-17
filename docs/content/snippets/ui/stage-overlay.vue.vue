<script setup lang="ts">
import { Anchored } from '@embedpdf/vue/anchored';
import { RenderLayer } from '@embedpdf/vue/render';
import type { SearchHit } from '@embedpdf/vue/search';
import { Stage } from '@embedpdf/vue/stage';
import { highlight } from './highlight';

defineProps<{ hit: SearchHit }>();
</script>

<template>
  <Stage>
    <template #page>
      <RenderLayer />
    </template>
    <template #overlay>
      <Anchored :anchor="{ page: hit.page, bounds: hit.bounds }" placement="bottom">
        <button @click="highlight(hit)">Highlight</button>
      </Anchored>
    </template>
  </Stage>
</template>
