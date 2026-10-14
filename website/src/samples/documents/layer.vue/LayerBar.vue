<script setup lang="ts">
import { onMounted, ref, shallowRef, watch } from 'vue';
import { useDocument, useDocuments } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { useMetadata, useMetadataState } from '@embedpdf/vue/metadata';

const props = defineProps<{
  reopened: boolean;
  withLayer: (layer?: Uint8Array) => Promise<OpenInput>;
}>();
const emit = defineEmits<{ reopened: [] }>();

const documents = useDocuments();
const metadata = useMetadata();
const title = useMetadataState((state) => state.metadata?.title ?? '');
const { id } = useDocument();
const layer = shallowRef<Uint8Array | null>(null);

// What the field shows: the title, until the user types.
const draft = ref(title.value);
watch(title, (value) => (draft.value = value));

// A change on load, so the layer has something in it. Opened again, the title comes from it.
onMounted(() => {
  if (!props.reopened) void metadata.update({ title: 'Reviewed by Dana' });
});

// Only the changes, as bytes you could store next to the original.
async function keepChanges() {
  layer.value = await documents.downloadLayer();
}

// Later: the original again, with the stored changes on top.
async function openAgain() {
  const stored = layer.value;
  if (!stored) return;
  // Said first: closing the document unmounts this bar, and then it can't emit.
  emit('reopened');
  await documents.close(id.value);
  await documents.open(() => props.withLayer(stored), { name: 'ebook.pdf' });
}
</script>

<template>
  <div class="toolbar">
    <input
      v-model="draft"
      class="field"
      aria-label="Title"
      @blur="metadata.update({ title: draft })"
    />
    <button type="button" class="button" @click="keepChanges">Keep the changes</button>
    <button type="button" class="button" :disabled="!layer" @click="openAgain">
      Open again with them
    </button>
  </div>
  <p class="note">
    <template v-if="reopened">
      Opened again: the original, with the title from the stored layer.
    </template>
    <template v-else-if="layer">
      The layer holds the changes in {{ layer.byteLength.toLocaleString() }} bytes.
    </template>
    <template v-else>Change the title, then keep the changes.</template>
  </p>
</template>
