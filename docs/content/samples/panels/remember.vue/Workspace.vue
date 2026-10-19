<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue';
import { Stage } from '@embedpdf/vue/stage';
import { RenderLayer } from '@embedpdf/vue/render';
import { useShell, useShellState } from '@embedpdf/vue/shell';
import type { ShellSnapshot } from '@embedpdf/vue/shell';
import NotesPanel from './NotesPanel.vue';
import PanelButton from './PanelButton.vue';
import TipsPanel from './TipsPanel.vue';
import { loadLayout, saveLayout } from './layout';

const shell = useShell();
const { openSurfaces } = useShellState();
const saved = shallowRef<ShellSnapshot | null>(loadLayout());

// The layout saved last time, or the tips the first time.
onMounted(() => {
  const layout = loadLayout();
  if (layout) shell.applySnapshot(layout);
  else shell.open('tips', { exclusive: 'left' });
});

function save() {
  const layout = shell.getSnapshot();
  saveLayout(layout);
  saved.value = layout;
}

function restore() {
  if (saved.value) shell.applySnapshot(saved.value);
}

const open = computed(() => openSurfaces.value.map((surface) => surface.id).join(', '));
</script>

<template>
  <div class="toolbar">
    <PanelButton id="tips" label="Tips" side="left" />
    <PanelButton id="notes" label="Notes" side="right" />
    <span class="spacer" />
    <button type="button" class="button" @click="save">Save layout</button>
    <button type="button" class="button" :disabled="!saved" @click="restore">Restore</button>
  </div>
  <p class="readout">Open: {{ open || 'no panels' }}</p>
  <div class="workspace">
    <TipsPanel />
    <Stage class="stage">
      <template #page><RenderLayer /></template>
    </Stage>
    <NotesPanel />
  </div>
</template>
