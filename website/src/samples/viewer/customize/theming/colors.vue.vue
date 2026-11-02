<script setup lang="ts">
import { ref } from 'vue';
import { PDFViewer, type ThemeConfig } from '@embedpdf/viewer-vue';

import './colors.css';

const welcome = '/pdfs/welcome.pdf';

// What both modes share, then the colors of each.
const brand: ThemeConfig = {
  accent: '#0f6e56',
  tokens: { radius: '2px' },
  light: { surface: '#fbfaf7', canvas: '#ece8df' },
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
