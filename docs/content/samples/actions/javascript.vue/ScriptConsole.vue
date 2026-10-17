<!-- Edit the script and run it. Its alerts and its errors show below it. -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useActions, useActionsEvent, useActionsUiAdapter } from '@embedpdf/vue/actions';
import type { ActionContext, PdfActionTree } from '@embedpdf/vue/actions';

// A JavaScript action, as a PDF carries it behind a button or a link.
const script = (code: string): PdfActionTree => ({
  root: { type: 'javascript', subtype: 'JavaScript', script: code, next: [] },
  incomplete: false,
  warningFlags: 0,
  warnings: [],
});
const click: ActionContext = {
  origin: 'user',
  source: { kind: 'api' },
  event: { scope: 'activate' },
};

const GREETING = "app.alert('Hello, ' + identity.name + ' from ' + identity.corporation + '!');";

const actions = useActions();
const code = ref(GREETING);
const output = ref<Array<{ kind: 'alert' | 'error'; text: string }>>([]);
const show = (kind: 'alert' | 'error', text: string) => {
  output.value = [{ kind, text }, ...output.value].slice(0, 5);
};

// A script's alert goes to your UI adapter: here, a line below the script.
useActionsUiAdapter({ alert: (message) => show('alert', message) });
useActionsEvent(
  (capability) => capability.onScriptFailed,
  ({ error }) => show('error', error.message),
);

// The greeting runs once on load.
onMounted(() => {
  void actions.execute(script(GREETING), click);
});

function withMistake() {
  code.value = 'app.alrt("typo");';
}
</script>

<template>
  <section class="panel">
    <label class="name" for="script">
      Script {{ actions.isScriptingEnabled() ? '' : '(JavaScript is off)' }}
    </label>
    <textarea id="script" v-model="code" class="code" :spellcheck="false" :rows="3" />
    <div class="actions">
      <button type="button" class="button primary" @click="actions.execute(script(code), click)">
        Run
      </button>
      <button type="button" class="button" @click="withMistake">A script with a mistake</button>
    </div>
    <ol class="output" aria-live="polite">
      <li v-for="(line, index) in output" :key="output.length - index" :class="line.kind">
        {{ line.text }}
      </li>
    </ol>
  </section>
</template>
