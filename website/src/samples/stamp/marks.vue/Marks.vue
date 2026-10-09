<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useStamp, useStampAssets, useStampLibraries, useStampState } from '@embedpdf/vue/stamp';
import MarkButton from './MarkButton.vue';

// A signature as a pen would draw it: two strokes, in points.
const loop = Array.from({ length: 48 }, (_, i) => ({
  x: i * 4,
  y: 30 - Math.sin(i / 3) * 16 - i * 0.2,
}));
const underline = [
  { x: 10, y: 52 },
  { x: 180, y: 46 },
];

const stamp = useStamp();
const libraries = useStampLibraries();
const library = computed(() => libraries.value[0]);
const marks = useStampAssets(() => ({ libraryId: library.value?.id }));
const { armedAsset } = useStampState();
const text = ref('Ada L.');

// On load: a drawn signature and typed initials, in a library of their own.
onMounted(() => {
  void stamp.createLibrary('Ada Lovelace').then(async ({ library: created }) => {
    await stamp.createAsset({
      libraryId: created.id,
      label: 'Signature',
      mark: { kind: 'ink', strokes: [loop, underline], strokeWidth: 2.5, color: '#1d2b53' },
    });
    await stamp.createAsset({
      libraryId: created.id,
      label: 'Initials',
      mark: { kind: 'text', text: 'AL', fontFamily: 'times-italic', color: '#1d2b53' },
    });
  });
});

async function typeMark() {
  const label = text.value.trim();
  if (!library.value || !label) return;
  const { asset } = await stamp.createAsset({
    libraryId: library.value.id,
    label,
    mark: { kind: 'text', text: label, fontFamily: 'times-italic', color: '#1d2b53' },
  });
  await stamp.armAsset(asset.id);
}
</script>

<template>
  <div class="toolbar">
    <MarkButton
      v-for="asset in marks"
      :key="asset.id"
      :asset="asset"
      :armed="armedAsset?.id === asset.id"
    />
    <span class="spacer" />
    <form class="type" @submit.prevent="typeMark">
      <input v-model="text" class="field" aria-label="Text of a typed stamp" />
      <button type="submit" class="button" :disabled="!library || !text.trim()">
        Type a stamp
      </button>
    </form>
  </div>
</template>
