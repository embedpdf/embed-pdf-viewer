<script setup lang="ts">
import { computed, watch } from 'vue';
import { useStage, useStageState } from '@embedpdf/vue/stage';
import { useAnnotationList, useAnnotationState } from '@embedpdf/vue/annotation';
import { useStamp, useStampAssets } from '@embedpdf/vue/stamp';
import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';

// The middle of a Letter page, and the cover's empty corner, in page coordinates.
const MIDDLE = { x: 306, y: 396 };
const CORNER = { x: 60, y: 590, width: 220, height: 180 };

const stamp = useStamp();
const stage = useStage();
const assets = useStampAssets();
const ready = useAnnotationState((state) => state.status === 'ready');
const currentPage = useStageState((state) => state.currentPageIndex);
const stamps = useAnnotationList({ subtype: 'stamp' });

const approved = computed(() => assets.value.find((asset) => asset.name === 'Approved'));
const draft = computed(() => assets.value.find((asset) => asset.name === 'Draft'));

// On load: the standard stamps, and "Approved" in the cover's empty corner, scrolled into view.
let placed = false;
watch(
  ready,
  (isReady) => {
    if (!isReady || placed) return;
    placed = true;
    void loadDefaultLibrary('en')
      .then((bytes) => stamp.importLibrary(bytes))
      .then(({ library }) => {
        const asset = stamp
          .listAssets({ libraryId: library.id })
          .find((candidate) => candidate.name === 'Approved');
        if (!asset) return;
        return stamp.placeAsset(asset.id, {
          page: 0,
          center: { x: 170, y: 680 },
          targetWidth: 180,
          rotation: -8,
        });
      })
      .then(() => stage.reveal(0, { rect: CORNER }));
  },
  { immediate: true },
);

function approveThisPage() {
  if (!approved.value) return;
  void stamp.placeAsset(approved.value.id, {
    page: currentPage.value,
    center: MIDDLE,
    select: true,
  });
}

function draftEveryPage() {
  if (!draft.value) return;
  void stamp.placeAssetOnPages(draft.value.id, 'all', {
    center: MIDDLE,
    targetWidth: 320,
    rotation: -30,
  });
}
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" :disabled="!approved" @click="approveThisPage">
      Approve this page
    </button>
    <button type="button" class="button" :disabled="!draft" @click="draftEveryPage">
      “Draft” on every page
    </button>
    <span class="spacer" />
    <output class="readout">
      {{ stamps.length }} {{ stamps.length === 1 ? 'stamp' : 'stamps' }} in the document
    </output>
  </div>
</template>
