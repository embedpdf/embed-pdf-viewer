<script setup lang="ts">
import { PDFViewer, type Layout, type LayoutEnv } from '@cloudpdf/viewer-vue';

import './phone.css';

const welcome = { grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

const layout = (layout: Layout, env: LayoutEnv) =>
  env.size === 'compact' ? layout.place('main', 'bottom') : layout;
</script>

<template>
  <div class="phone">
    <PDFViewer :src="welcome" :layout="layout" style="height: 100%" />
  </div>
</template>
