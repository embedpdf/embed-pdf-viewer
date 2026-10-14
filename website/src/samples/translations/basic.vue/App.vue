<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { commandsPlugin, standardCommands } from '@embedpdf/vue/commands';
import { i18nPlugin } from '@embedpdf/vue/i18n';
import type { Locale } from '@embedpdf/vue/i18n';
import { localEngine } from '@embedpdf/engine';
import CommandButton from './CommandButton.vue';
import LanguagePicker from './LanguagePicker.vue';
import PageCount from './PageCount.vue';

import '../basic.css';

const engine = localEngine();

// Your strings. The buttons' labels are the standard commands', which come translated.
const en: Locale = {
  code: 'en',
  name: 'English',
  translations: {
    app: { language: 'Language', pages: { one: '{count} page', other: '{count} pages' } },
  },
};
const nl: Locale = {
  code: 'nl',
  name: 'Nederlands',
  translations: {
    app: { language: 'Taal', pages: { one: '{count} pagina', other: "{count} pagina's" } },
  },
};

const plugins = [
  stagePlugin(),
  renderPlugin(),
  commandsPlugin({ commands: standardCommands }),
  i18nPlugin({
    locale: 'nl',
    locales: [en, nl],
    // Loaded the first time someone picks them; in your app, `() => import('./locales/de')`.
    loaders: {
      de: async () => ({
        code: 'de',
        name: 'Deutsch',
        translations: {
          app: { language: 'Sprache', pages: { one: '{count} Seite', other: '{count} Seiten' } },
        },
      }),
      ja: async () => ({
        code: 'ja',
        name: '日本語',
        translations: { app: { language: '言語', pages: { other: '{count} ページ' } } },
      }),
    },
  }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">…</p></template>
      <div class="toolbar">
        <LanguagePicker />
        <CommandButton id="page:previous" />
        <CommandButton id="page:next" />
        <CommandButton id="zoom:in" />
        <CommandButton id="document:print" />
        <PageCount />
      </div>
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
