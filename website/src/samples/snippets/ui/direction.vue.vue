<script setup lang="ts">
import { useI18nState } from '@embedpdf/vue/i18n';

const { direction } = useI18nState();
</script>

<template>
  <div :dir="direction">
    <!-- your viewer -->
  </div>
</template>
