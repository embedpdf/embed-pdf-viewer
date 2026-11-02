<!-- Every font the document can be written in, grouped by where it comes from. -->
<script setup lang="ts">
import { computed } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import type { Font, FontRestriction } from '@embedpdf/vue/runtime';
import { useAnnotation } from '@embedpdf/vue/annotation';
import { useFontsState } from '@embedpdf/vue/fonts';

const GROUPS = [
  ['document', 'In this document'],
  ['engine', 'The engine’s fonts'],
  ['standard', 'Standard'],
] as const;

// Why a font can't be chosen for new text, by its first restriction.
const WHY: Record<FontRestriction, string> = {
  subset: 'holds only the characters its text uses',
  'not-embedded': 'the file only names it',
  'preview-and-print': 'licensed for viewing and printing only',
  'unsupported-format': 'new text is written in TrueType or OpenType',
  'no-unicode-map': 'doesn’t say which characters it draws',
  'not-served': 'stays on the server',
};

const { fonts, status } = useFontsState();
const annotation = useAnnotation();
const pages = usePageList();

const groups = computed(() =>
  GROUPS.map(([source, title]) => ({
    source,
    title,
    fonts: fonts.value?.fonts.filter((font) => font.source === source) ?? [],
  })),
);
const whyOf = (font: Font) =>
  font.canChoose ? null : WHY[font.restrictions[0] ?? 'unsupported-format'];

// The engine fills Hebrew in from a Hebrew font and puts it in the file: the list reads it.
async function writeHebrew() {
  const cover = pages.value[0]?.ref;
  if (!cover) return;
  await annotation.create(cover, {
    subtype: 'free-text',
    box: { x: 72, y: 72, width: 220, height: 40 },
    contents: 'שלום עולם',
    fontFamily: 'helvetica',
  });
}
</script>

<template>
  <section class="panel">
    <header class="panel-header">
      <h3 class="panel-title">Fonts</h3>
      <button type="button" class="button" @click="writeHebrew">Write in Hebrew</button>
      <span class="status" :data-status="status">{{ status }}</span>
    </header>
    <div v-for="group in groups" :key="group.source" class="group">
      <h4 class="group-title">{{ group.title }}</h4>
      <p v-if="group.fonts.length === 0" class="empty">None</p>
      <ul v-else class="chips">
        <li
          v-for="font in group.fonts"
          :key="font.name"
          class="chip"
          :data-choosable="font.canChoose"
        >
          <span class="chip-name">{{ font.name }}</span>
          <span v-if="whyOf(font)" class="chip-why">{{ whyOf(font) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
