<script setup lang="ts">
import { useStageState } from '@embedpdf/vue/stage';
import { useT } from '@embedpdf/vue/i18n';

const t = useT();
const { pageCount } = useStageState();
</script>

<template>
  <output class="count">{{ t('app.pages', { params: { count: pageCount } }) }}</output>
</template>
