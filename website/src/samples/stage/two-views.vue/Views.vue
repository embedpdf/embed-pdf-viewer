<script setup lang="ts">
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage, useStage, useStageState } from '@embedpdf/vue/stage';
import { OverviewToken } from './overview-token';
import ZoomBar from './ZoomBar.vue';

const main = useStage();
const current = useStageState((state) => state.currentPageIndex);
</script>

<template>
  <div class="views">
    <section class="view overview">
      <ZoomBar label="Overview" :token="OverviewToken" />
      <Stage :token="OverviewToken" class="stage">
        <template #page="{ page }">
          <button
            type="button"
            class="page-button"
            :aria-label="`Go to page ${page.pageIndex + 1}`"
            :aria-current="page.pageIndex === current"
            @click="main.goToPage(page.ref)"
          >
            <RenderLayer />
          </button>
        </template>
      </Stage>
    </section>
    <section class="view main">
      <ZoomBar label="Main view" />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </section>
  </div>
</template>
