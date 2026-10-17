<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { stagePlugin } from '@embedpdf/vue/stage';
import { renderPlugin } from '@embedpdf/vue/render';
import { commandsPlugin, standardCommands } from '@embedpdf/vue/commands';
import { i18nPlugin } from '@embedpdf/vue/i18n';
import type { Locale } from '@embedpdf/vue/i18n';
import { localEngine } from '@embedpdf/engine';
import ViewerRoot from './ViewerRoot.vue';

import '../rtl.css';

const engine = localEngine();

const en: Locale = {
  code: 'en',
  name: 'English',
  translations: { app: { title: 'The ebook', switchTo: 'العربية' } },
};
// Arabic reads right to left. The standard commands have no Arabic labels, so the app gives
// them, under the same keys.
const ar: Locale = {
  code: 'ar',
  name: 'العربية',
  direction: 'rtl',
  translations: {
    app: { title: 'الكتاب الإلكتروني', switchTo: 'English' },
    commands: {
      page: { previous: 'الصفحة السابقة', next: 'الصفحة التالية' },
      zoom: { in: 'تكبير', out: 'تصغير' },
    },
  },
};

const plugins = [
  stagePlugin(),
  renderPlugin(),
  commandsPlugin({ commands: standardCommands }),
  i18nPlugin({ locale: 'ar', locales: [en, ar] }),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">…</p></template>
      <ViewerRoot />
    </DocumentGate>
  </Viewer>
</template>
