<script setup lang="ts">
import { ref, watch } from 'vue';
import { copyImage, saveFile } from '@embedpdf/vue/runtime';
import { useSnapshot } from '@embedpdf/vue/render';
import { useInteraction, useInteractionState } from '@embedpdf/vue/interaction';

const interaction = useInteraction();
const { activeToolId } = useInteractionState();
const snapshot = useSnapshot();
const said = ref('');
// A new snapshot, or none: nothing copied yet.
watch(snapshot, () => (said.value = ''));

function copy() {
  if (!snapshot.value) return;
  // In the click itself: the picture goes to the clipboard as it comes.
  copyImage(snapshot.value.image).then(
    () => (said.value = 'Copied: paste it anywhere'),
    () => (said.value = 'This browser didn’t allow the copy'),
  );
}

async function save() {
  if (!snapshot.value) return;
  saveFile(await (await snapshot.value.image).blob(), 'snapshot.png');
}
</script>

<template>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Tool">
      <button
        type="button"
        class="segment"
        :aria-pressed="activeToolId === 'pan'"
        @click="interaction.activateTool('pan')"
      >
        Hand
      </button>
      <button
        type="button"
        class="segment"
        :aria-pressed="activeToolId === 'snapshot'"
        @click="interaction.activateTool('snapshot')"
      >
        Snapshot
      </button>
    </div>
    <div class="actions">
      <button type="button" class="button" :disabled="!snapshot" @click="copy">Copy</button>
      <button type="button" class="button" :disabled="!snapshot" @click="save">Save</button>
    </div>
    <output class="readout">
      {{ said || (activeToolId === 'snapshot' && !snapshot ? 'Drag a box on a page' : '') }}
    </output>
  </div>
</template>
