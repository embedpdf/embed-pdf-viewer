<script setup lang="ts">
import { onMounted, shallowRef } from 'vue';
import type { PageRef } from '@embedpdf/vue/runtime';
import { useStage, useStageState } from '@embedpdf/vue/stage';
import type { StageViewState, Viewpoint } from '@embedpdf/vue/stage';

const stage = useStage();
const { currentPageIndex, zoomLevel } = useStageState();
// One spot on one page, and the whole view: settings and position.
const spot = shallowRef<{ page: PageRef; viewpoint: Viewpoint; label: string } | null>(null);
const view = shallowRef<StageViewState | null>(null);

function rememberSpot() {
  const page = stage.getCurrentPage();
  if (!page) return;
  const label = `page ${stage.getCurrentPageIndex() + 1}`;
  spot.value = { page, viewpoint: stage.getViewpoint(), label };
}

function goBack() {
  if (spot.value) stage.goToPage(spot.value.page, { viewpoint: spot.value.viewpoint });
}

function restore() {
  if (view.value) stage.applyViewState(view.value);
}

// Remember where the reader starts, so "Go back" works right away.
onMounted(rememberSpot);
</script>

<template>
  <div class="toolbar">
    <div class="group">
      <button type="button" class="button" @click="rememberSpot">Remember this spot</button>
      <button type="button" class="button" :disabled="!spot" @click="goBack">
        Go back{{ spot ? ` to ${spot.label}` : '' }}
      </button>
    </div>
    <div class="group">
      <button type="button" class="button" @click="view = stage.getViewState()">
        Save the view
      </button>
      <button type="button" class="button" :disabled="!view" @click="restore">Restore it</button>
    </div>
    <output class="badge">
      page <strong>{{ currentPageIndex + 1 }}</strong> ·
      <strong>{{ Math.round(zoomLevel * 100) }}%</strong>
    </output>
  </div>
</template>
