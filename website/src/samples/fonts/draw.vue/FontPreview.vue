<!-- Type in any font the document can be written in, drawn as the engine will write it. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFontCss, useFontsState } from '@embedpdf/vue/fonts';

const { fonts } = useFontsState();
const font = ref('times-roman');
// The font's CSS, its programs mounted while this component lives.
const css = useFontCss(font);
const choosable = computed(() => fonts.value?.fonts.filter((entry) => entry.canChoose) ?? []);
</script>

<template>
  <section class="panel">
    <label class="field">
      Font
      <select v-model="font">
        <option v-for="entry in choosable" :key="entry.name" :value="entry.name">
          {{ entry.name }}
        </option>
      </select>
    </label>
    <textarea
      class="preview"
      :style="{
        fontFamily: css?.fontFamily,
        fontWeight: css?.fontWeight,
        fontStyle: css?.fontStyle,
        fontSynthesis: 'none',
      }"
    >
Hello שלום مرحبا 你好</textarea
    >
    <p class="hint">Characters no font has show as boxes, as the engine writes them.</p>
  </section>
</template>
