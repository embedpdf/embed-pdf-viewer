<script setup lang="ts">
import { useTranslation } from '../hooks/use-i18n';

interface TranslateProps {
  k: string;
  params?: Record<string, string | number>;
}

const props = defineProps<TranslateProps>();
const translation = useTranslation(props.k, props.params);
</script>

<template>
  <span>{{ translation }}</span>
</template>
