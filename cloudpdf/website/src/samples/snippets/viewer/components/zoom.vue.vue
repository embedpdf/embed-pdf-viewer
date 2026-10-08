<script setup lang="ts">
import { Button, useCommand } from '@embedpdf/viewer-vue';
import { useStageState } from '@embedpdf/vue/stage';

const { zoomLevel } = useStageState();
const fitWidth = useCommand('zoom:fit-width');
</script>

<template>
  <div class="zoom-pill">
    <Button command="zoom:out" />
    <span>{{ Math.round(zoomLevel * 100) }}%</span>
    <Button command="zoom:in" />
    <button class="chip" :aria-pressed="fitWidth?.active" @click="fitWidth?.run()">
      {{ fitWidth?.label }}
    </button>
  </div>
</template>
