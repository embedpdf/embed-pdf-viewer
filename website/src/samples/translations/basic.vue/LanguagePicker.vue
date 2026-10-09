<script setup lang="ts">
import { useI18n, useI18nState, useT } from '@embedpdf/vue/i18n';

const i18n = useI18n();
const t = useT();
const { locale, locales, loading } = useI18nState();

function onChange(event: Event) {
  void i18n.setLocale((event.target as HTMLSelectElement).value);
}
</script>

<template>
  <label class="picker">
    {{ t('app.language') }}
    <select class="select" :value="locale" :disabled="loading !== null" @change="onChange">
      <option v-for="language in locales" :key="language.code" :value="language.code">
        {{ language.name }}
      </option>
    </select>
  </label>
</template>
