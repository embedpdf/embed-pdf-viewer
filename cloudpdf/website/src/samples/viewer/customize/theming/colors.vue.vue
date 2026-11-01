<script setup lang="ts">
import { ref } from 'vue';
import { PDFViewer, type ThemeConfig } from '@cloudpdf/viewer-vue';

import './colors.css';

const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

// Your colors for both modes, and what's different in dark.
const brand: ThemeConfig = {
  accent: '#0f6e56',
  tokens: { surface: '#fbfaf7', canvas: '#ece8df', radius: '2px' },
  dark: {
    accent: '#4fbf98',
    surface: '#16201c',
    'surface-raised': '#1d2a25',
    canvas: '#0c1210',
    hover: '#24332d',
  },
};

const dark = ref(false);
</script>

<template>
  <div :class="['app', { dark }]">
    <header class="bar">
      <label>
        <input v-model="dark" type="checkbox" />
        Dark
      </label>
    </header>
    <PDFViewer
      class="viewer"
      :src="welcome"
      :theme="{ ...brand, preference: dark ? 'dark' : 'light' }"
    />
  </div>
</template>
