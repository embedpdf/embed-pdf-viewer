<script setup lang="ts">
import { useTranslation } from '../hooks/use-i18n';

interface TranslateProps {
  k: string;
  params?: Record<string, string | number>;
  fallback?: string;
  documentId?: string;
}

const props = defineProps<TranslateProps>();
const translation = useTranslation(
  props.k,
  { params: props.params, fallback: props.fallback },
  () => props.documentId,
);
</script>

<template>
  <span>{{ translation }}</span>
</template>
