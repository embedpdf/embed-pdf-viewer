<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { SearchLayer, searchPlugin } from '@embedpdf/vue/search';
import { cloudEngine } from '@cloudpdf/engine';
import Controls from './Controls.vue';
import ReopenOnRoleChange from './ReopenOnRoleChange.vue';

import '../checks.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  searchPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// What each role may do, as permissions.
const roles = {
  viewer: ['doc.open', 'doc.render', 'doc.text.select'],
  reviewer: ['doc.open', 'doc.render', 'doc.text.select', 'doc.text.copy', 'doc.text.search'],
  owner: [
    'doc.open',
    'doc.render',
    'doc.text.select',
    'doc.text.copy',
    'doc.text.search',
    'doc.download',
  ],
};
type Role = keyof typeof roles;

const role = ref<Role>('reviewer');
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :scope="roles[role]"
    :initial-documents="[{ source: ebook, name: 'ebook.pdf' }]"
  >
    <div class="toolbar">
      <label class="label">
        Role
        <select v-model="role" class="select">
          <option value="viewer">viewer: read and select</option>
          <option value="reviewer">reviewer: also search and copy</option>
          <option value="owner">owner: also download</option>
        </select>
      </label>
    </div>
    <ReopenOnRoleChange :role="role" :ebook="ebook" />
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <Controls />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SearchLayer />
          <SelectionLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
