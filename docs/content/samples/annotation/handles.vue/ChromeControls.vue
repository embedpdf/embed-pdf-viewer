<script setup lang="ts">
import { useAnnotation, useAnnotationSettings } from '@embedpdf/vue/annotation';

const ACCENTS = ['#054fb3', '#e91e63', '#0f6e56'];

/** Whether the layer draws your handles. */
const own = defineModel<boolean>('own', { required: true });

const annotation = useAnnotation();
const chrome = useAnnotationSettings((settings) => settings.chrome);

const checked = (event: Event) => (event.target as HTMLInputElement).checked;
</script>

<template>
  <div class="toolbar">
    <div class="swatches" role="group" aria-label="Accent">
      <button
        v-for="accent in ACCENTS"
        :key="accent"
        type="button"
        class="swatch"
        :aria-label="accent"
        :aria-pressed="chrome.accent === accent"
        :style="{ background: accent }"
        @click="annotation.updateSettings({ chrome: { accent } })"
      />
    </div>
    <label class="check">
      <input
        type="checkbox"
        :checked="chrome.outline.style === 'dashed'"
        @change="
          annotation.updateSettings({
            chrome: { outline: { style: checked($event) ? 'dashed' : 'solid' } },
          })
        "
      />
      Dashed outline
    </label>
    <label class="check">
      <input
        type="checkbox"
        :checked="chrome.handles.shape === 'circle'"
        @change="
          annotation.updateSettings({
            chrome: { handles: { shape: checked($event) ? 'circle' : 'square' } },
          })
        "
      />
      Round handles
    </label>
    <label class="check">
      <input v-model="own" type="checkbox" />
      Draw them myself
    </label>
    <button type="button" class="button" @click="annotation.resetSettings()">Reset</button>
  </div>
</template>
