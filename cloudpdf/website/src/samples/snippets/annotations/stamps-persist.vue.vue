<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import {
  indexedDbByteStore,
  persistStampLibraries,
  restoreStampLibraries,
  useStamp,
  useStampLibraries,
} from '@embedpdf/vue/stamp';

const store = indexedDbByteStore('stamps');
const stamp = useStamp();
const libraries = useStampLibraries();

let stop: (() => void) | undefined;

onMounted(() => {
  void restoreStampLibraries(stamp, store); // import every stored library
  stop = persistStampLibraries(stamp, store, { except: ['embedpdf-standard'] });
});
onUnmounted(() => stop?.());
</script>

<template>
  <ul>
    <li v-for="library in libraries" :key="library.id">{{ library.name }}</li>
  </ul>
</template>
