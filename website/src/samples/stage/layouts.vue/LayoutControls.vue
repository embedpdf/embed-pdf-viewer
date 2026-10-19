<script setup lang="ts">
import { useStage, useStageSettings } from '@embedpdf/vue/stage';
import type { FlowMode, LayoutKind, SpreadMode } from '@embedpdf/vue/stage';

const stage = useStage();
const { flow, layout, spread } = useStageSettings();

const valueOf = (event: Event) => (event.target as HTMLSelectElement).value;
</script>

<template>
  <div class="toolbar">
    <label class="label">
      Flow
      <select
        class="select"
        :value="flow"
        @change="stage.updateSettings({ flow: valueOf($event) as FlowMode })"
      >
        <option value="continuous">continuous</option>
        <option value="paged">paged</option>
      </select>
    </label>
    <label class="label">
      Layout
      <select
        class="select"
        :value="layout"
        @change="stage.updateSettings({ layout: valueOf($event) as LayoutKind })"
      >
        <option value="vertical">vertical</option>
        <option value="horizontal">horizontal</option>
        <option value="grid">grid</option>
      </select>
    </label>
    <label class="label">
      Spread
      <select
        class="select"
        :value="spread"
        @change="stage.updateSettings({ spread: valueOf($event) as SpreadMode })"
      >
        <option value="none">none</option>
        <option value="odd">odd</option>
        <option value="even">even</option>
      </select>
    </label>
    <div class="pager">
      <button type="button" class="button" aria-label="Previous" @click="stage.previousPage()">
        ‹
      </button>
      <button type="button" class="button" aria-label="Next" @click="stage.nextPage()">›</button>
    </div>
  </div>
</template>
