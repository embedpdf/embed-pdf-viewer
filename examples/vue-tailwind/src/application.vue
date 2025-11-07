<template>
  <HomePage v-if="route === '/'" />
  <AboutPage v-else-if="route === '/about'" />
  <ViewerPage v-else-if="route === '/viewer'" />
  <ViewerSimplePage v-else-if="route === '/viewer-simple'" />
  <HomePage v-else />
</template>

<script setup lang="ts">
import { useHashRoute } from './router';
import HomePage from './pages/home.vue';
import AboutPage from './pages/about.vue';
import ViewerPage from './pages/viewer.vue';
import ViewerSimplePage from './pages/viewer-simple.vue';

const { route } = useHashRoute();
</script>
