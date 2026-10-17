<script setup lang="ts">
import { ref } from 'vue';
import { useInteraction } from '@embedpdf/vue/interaction';
import { Toolbar, group } from '@embedpdf/vue/toolbar';
import type { BarSchema } from '@embedpdf/vue/toolbar';

// A bar per mode.
const viewBar: BarSchema = {
  id: 'view',
  sections: {
    start: [group('tools', ['tool:pointer', 'tool:pan'])],
    center: [
      group('pages', ['page:previous', 'page:next']),
      group('zoom', ['zoom:out', 'zoom:in']),
    ],
  },
};

const annotateBar: BarSchema = {
  id: 'annotate',
  sections: {
    start: [group('markup', ['tool:highlight', 'tool:underline', 'tool:strikeout'])],
    center: [group('draw', ['tool:ink', 'tool:square', 'tool:circle', 'tool:note'])],
    end: [group('edit', ['annotation:delete'])],
  },
};

type Mode = 'view' | 'annotate';
const BARS: Record<Mode, BarSchema> = { view: viewBar, annotate: annotateBar };
const TOOL_OF_MODE: Record<Mode, string> = { view: 'pointer', annotate: 'highlight' };
const MODES = ['view', 'annotate'] as const;

const interaction = useInteraction();
const mode = ref<Mode>('view');

// Each mode starts with its own tool.
function switchTo(next: Mode) {
  mode.value = next;
  interaction.activateTool(TOOL_OF_MODE[next]);
}
</script>

<template>
  <div class="chrome">
    <div class="modes" role="tablist" aria-label="Mode">
      <button
        v-for="each in MODES"
        :key="each"
        type="button"
        role="tab"
        class="mode"
        :aria-selected="mode === each"
        @click="switchTo(each)"
      >
        {{ each === 'view' ? 'View' : 'Annotate' }}
      </button>
    </div>
    <Toolbar :bar="BARS[mode]" class="toolbar">
      <template #command="{ command, run }">
        <button
          type="button"
          class="button"
          :disabled="!command.enabled"
          :aria-pressed="command.active"
          @click="run()"
        >
          {{ command.label }}
        </button>
      </template>
    </Toolbar>
  </div>
</template>
