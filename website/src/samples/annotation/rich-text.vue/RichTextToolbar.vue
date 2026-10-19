<script setup lang="ts">
import { computed } from 'vue';
import { useAnnotation, useAnnotationProperties } from '@embedpdf/vue/annotation';

type Format = 'bold' | 'italic' | 'underline';
const FORMATS: readonly Format[] = ['bold', 'italic', 'underline'];

// The same calls style the selected words while typing, and the whole box otherwise.
const annotation = useAnnotation();
const panel = useAnnotationProperties();
const hasText = computed(() =>
  panel.value.properties.some((property) => property.control === 'textFormat'),
);
// On when every selected word has it; `mixed` lists what the words disagree on.
const isOn = (format: Format) =>
  panel.value.values[format] === true && !panel.value.mixed.includes(format);
const large = computed(() => panel.value.values.fontSize === 24);
</script>

<template>
  <div class="toolbar">
    <button
      v-for="format in FORMATS"
      :key="format"
      type="button"
      :class="['button', format]"
      :aria-pressed="isOn(format)"
      :disabled="!hasText"
      @click="annotation.text.toggleFormat(format)"
    >
      {{ format[0]!.toUpperCase() }}
    </button>
    <button
      type="button"
      class="button"
      :disabled="!hasText"
      @click="annotation.selection.update({ fontColor: '#c00000' })"
    >
      Red
    </button>
    <button
      type="button"
      class="button"
      :disabled="!hasText"
      @click="annotation.selection.update({ fontSize: large ? 16 : 24 })"
    >
      {{ large ? '16 pt' : '24 pt' }}
    </button>
    <p class="hint">Ctrl or Cmd with B, I or U works while you type</p>
  </div>
</template>
