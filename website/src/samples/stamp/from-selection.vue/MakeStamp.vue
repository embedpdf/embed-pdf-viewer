<script setup lang="ts">
import { computed } from 'vue';
import { useAnnotationState } from '@embedpdf/vue/annotation';
import { useStamp, useStampAssets, useStampState } from '@embedpdf/vue/stamp';
import MyStamp from './MyStamp.vue';

const MY_STAMPS = 'my-stamps';

const stamp = useStamp();
const selected = useAnnotationState((state) => state.selected);
const mine = useStampAssets({ libraryId: MY_STAMPS });
const { armedAsset } = useStampState();

// A stamp is one page of artwork: the selection must be on one page.
const page = computed(() => selected.value[0]?.page);
const canMake = computed(() => {
  const onePage = selected.value.every(
    (annotation) => annotation.page.objectNumber === page.value?.objectNumber,
  );
  return !!page.value && onePage && stamp.canCreateFromAnnotations();
});

async function make() {
  if (!page.value) return;
  // The library is made on first use.
  if (!stamp.getLibrary(MY_STAMPS)) await stamp.createLibrary('My stamps', { id: MY_STAMPS });
  const { asset } = await stamp.createAssetFromAnnotations(
    page.value,
    selected.value.map((annotation) => annotation.ref),
    { libraryId: MY_STAMPS, label: `My stamp ${mine.value.length + 1}` },
  );
  await stamp.armAsset(asset.id);
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" :disabled="!canMake" @click="make">
      Make a stamp of the selection
    </button>
    <MyStamp
      v-for="asset in mine"
      :key="asset.id"
      :asset="asset"
      :armed="armedAsset?.id === asset.id"
    />
    <span class="spacer" />
    <output class="readout">
      {{ armedAsset ? 'Click a page to place it' : `${selected.length} selected` }}
    </output>
  </div>
</template>
