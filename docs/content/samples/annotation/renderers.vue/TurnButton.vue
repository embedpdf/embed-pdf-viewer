<script setup lang="ts">
import { useStage } from '@embedpdf/vue/stage';

// A note keeps its size on screen and stays upright: turn the view to see it.
const stage = useStage();
</script>

<template>
  <button type="button" class="button" @click="stage.rotateViewBy(90)">Turn the view</button>
</template>
