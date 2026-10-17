<script setup lang="ts">
import { useT } from '@embedpdf/vue/i18n';

const t = useT();
</script>

<template>
  <button>{{ t('toolbar.save') }}</button>
</template>
