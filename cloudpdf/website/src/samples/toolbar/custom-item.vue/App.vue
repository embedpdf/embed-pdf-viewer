<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { commandsPlugin, standardCommands } from '@embedpdf/vue/commands';
import { Toolbar } from '@embedpdf/vue/toolbar';
import { cloudEngine } from '@cloudpdf/engine';
import GoToPage from './GoToPage.vue';
import PageNumber from './PageNumber.vue';
import { ICONS, bar } from './bar';

import '../custom-item.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), commandsPlugin({ commands: standardCommands })];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const width = ref(100);
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <label class="width">
        Toolbar width
        <input v-model.number="width" type="range" min="30" max="100" />
        <output>{{ width }}%</output>
      </label>
      <div class="frame" :style="{ width: `${width}%` }">
        <Toolbar :bar="bar">
          <template #command="{ command, variant, run }">
            <button
              type="button"
              class="button"
              :title="command.label"
              :aria-label="command.label"
              :disabled="!command.enabled"
              @click="run()"
            >
              <span aria-hidden="true">{{ ICONS[command.icon ?? ''] ?? '…' }}</span>
              <span v-if="variant === 'icon+label'">{{ command.label }}</span>
            </button>
          </template>
          <template #custom="{ name, variant }">
            <PageNumber v-if="name === 'page-number'" :compact="variant === 'compact'" />
          </template>
        </Toolbar>
      </div>
      <GoToPage />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
