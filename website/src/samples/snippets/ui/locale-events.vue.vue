<script setup lang="ts">
import { useI18nEvent } from '@embedpdf/vue/i18n';

useI18nEvent(
  (i18n) => i18n.onLocaleChanged,
  ({ locale }) => document.documentElement.setAttribute('lang', locale),
);
</script>

<template>
  <!-- your toolbar and pages -->
</template>
