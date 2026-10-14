<script setup lang="ts">
import { Stage } from '@embedpdf/vue/stage';
import { RenderLayer } from '@embedpdf/vue/render';
import { useI18n, useI18nState, useT } from '@embedpdf/vue/i18n';
import CommandButton from './CommandButton.vue';

// The toolbar follows the language: in Arabic it runs from right to left.
const i18n = useI18n();
const t = useT();
const { direction, locale } = useI18nState();
</script>

<template>
  <div :dir="direction" class="root">
    <div class="toolbar">
      <strong class="title">{{ t('app.title') }}</strong>
      <CommandButton id="page:previous" />
      <CommandButton id="page:next" />
      <CommandButton id="zoom:out" />
      <CommandButton id="zoom:in" />
      <button
        type="button"
        class="button switch"
        @click="i18n.setLocale(locale === 'ar' ? 'en' : 'ar')"
      >
        {{ t('app.switchTo') }}
      </button>
    </div>
    <Stage class="stage">
      <template #page><RenderLayer /></template>
    </Stage>
  </div>
</template>
