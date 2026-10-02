<!-- The viewer actions a PDF's buttons name, run from your own buttons. -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useStageState } from '@embedpdf/vue/stage';
import { useActions, useActionsUiAdapter } from '@embedpdf/vue/actions';
import type { PdfNamedAction } from '@embedpdf/vue/actions';

const VERBS: ReadonlyArray<[PdfNamedAction, string]> = [
  ['FirstPage', '⇤ First'],
  ['PrevPage', '‹ Previous'],
  ['NextPage', 'Next ›'],
  ['LastPage', 'Last ⇥'],
  ['Print', 'Print'],
];

const actions = useActions();
const { currentPageIndex, pageCount } = useStageState();
const ran = ref<string | null>(null);

// Print goes to your UI adapter. This one says so, instead of opening the browser's print dialog.
useActionsUiAdapter({
  print: () => {
    ran.value = 'Print: your print handler ran';
  },
});

// On load, as if a "Last page" button in the PDF was clicked. Running it twice changes nothing.
onMounted(() => {
  void actions.executeNamed('LastPage').then(({ status }) => {
    ran.value = `LastPage: ${status}`;
  });
});

async function runNamed(name: PdfNamedAction) {
  const { status } = await actions.executeNamed(name);
  if (name !== 'Print') ran.value = `${name}: ${status}`;
}
</script>

<template>
  <div class="toolbar">
    <button
      v-for="[name, label] in VERBS"
      :key="name"
      type="button"
      class="button"
      :disabled="!actions.canExecuteNamed(name)"
      @click="runNamed(name)"
    >
      {{ label }}
    </button>
    <span class="spacer" />
    <output class="readout">
      Page {{ currentPageIndex + 1 }} of {{ pageCount }}
      <span v-if="ran" class="ran">· {{ ran }}</span>
    </output>
  </div>
</template>
