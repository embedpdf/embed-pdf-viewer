<script setup lang="ts">
import { computed, ref } from 'vue';
import { epdfTheme } from '@embedpdf/vue/runtime';

import Pages from './pages.vue';

const accent = ref('#e91e63');
const theme = computed(() => epdfTheme({ accent: accent.value }));
</script>

<template>
  <div class="pdf-viewer" :style="theme">
    <input v-model="accent" type="color" />
    <Pages />
  </div>
</template>
