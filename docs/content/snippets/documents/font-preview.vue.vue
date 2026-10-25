<script setup lang="ts">
import { useFontCss } from '@embedpdf/vue/fonts';

const props = defineProps<{ font: string }>();
// Its programs are mounted while this component lives.
const css = useFontCss(() => props.font);
</script>

<template>
  <input
    value="Hello שלום"
    :style="{
      fontFamily: css?.fontFamily,
      fontWeight: css?.fontWeight,
      fontStyle: css?.fontStyle,
      fontSynthesis: 'none',
    }"
  />
</template>
