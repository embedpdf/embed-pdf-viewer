<script setup lang="ts">
import { useI18n, useI18nState } from '@embedpdf/vue/i18n';

const i18n = useI18n();
const { locale, locales, loading } = useI18nState();

function onChange(event: Event) {
  i18n.setLocale((event.target as HTMLSelectElement).value);
}
</script>

<template>
  <select :value="locale" :disabled="loading !== null" @change="onChange">
    <option v-for="language in locales" :key="language.code" :value="language.code">
      {{ language.name }}
    </option>
  </select>
</template>
