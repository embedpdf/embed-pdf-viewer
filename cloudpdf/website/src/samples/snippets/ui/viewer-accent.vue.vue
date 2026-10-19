<script setup lang="ts">
import { Viewer } from '@embedpdf/vue/runtime';

import Pages from './pages.vue';
import { engine, plugins } from './pdf';
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" accent="#e91e63" :page="{ shadow: 'none' }">
    <Pages />
  </Viewer>
</template>
