<script setup lang="ts">
import { useStage, useStageSettings, useStageState } from '@embedpdf/vue/stage';

const narrow = defineModel<boolean>('narrow', { required: true });

const stage = useStage();
// One breakpoint drives both the layout and this toolbar.
const compact = useStageState((state) => state.activeRules.includes('compact'));
const { padding, spread } = useStageSettings();
</script>

<template>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="Stage width">
      <button type="button" :aria-pressed="!narrow" @click="narrow = false">Full width</button>
      <button type="button" :aria-pressed="narrow" @click="narrow = true">360 px</button>
    </div>
    <output class="badge" :data-on="compact">
      compact <strong>{{ compact ? 'on' : 'off' }}</strong>
    </output>
    <output class="badge">
      padding <strong>{{ padding }}</strong> · spread <strong>{{ spread }}</strong>
    </output>
    <div class="pager">
      <button type="button" class="button" @click="stage.previousPage()">
        {{ compact ? '‹' : '‹ Previous' }}
      </button>
      <button type="button" class="button" @click="stage.nextPage()">
        {{ compact ? '›' : 'Next ›' }}
      </button>
    </div>
  </div>
</template>
