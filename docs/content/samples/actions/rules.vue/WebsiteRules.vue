<!-- The rules for websites, changed while the app runs, and what happens when the link runs. -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  useActions,
  useActionsEvent,
  useActionsSettings,
  useActionsUiAdapter,
} from '@embedpdf/vue/actions';
import type {
  ActionContext,
  ActionOrigin,
  ActionPolicyDecision,
  PdfActionTree,
} from '@embedpdf/vue/actions';

// A link to a website, as a PDF carries it: what getActionTree() reads from a link.
const websiteLink: PdfActionTree = {
  root: { type: 'uri', subtype: 'URI', uri: 'https://www.embedpdf.com', isMap: false, next: [] },
  incomplete: false,
  warningFlags: 0,
  warnings: [],
};

// The three ways an action can start, each as the context it runs with.
const STARTS: ReadonlyArray<{ label: string; context: ActionContext }> = [
  {
    label: 'A click',
    context: { origin: 'user', source: { kind: 'api' }, event: { scope: 'activate' } },
  },
  {
    label: 'The pointer over it',
    context: {
      origin: 'hover',
      source: { kind: 'api' },
      event: { scope: 'annotation', name: 'cursorEnter' },
    },
  },
  {
    label: 'The document opening',
    context: {
      origin: 'lifecycle',
      source: { kind: 'api' },
      event: { scope: 'document', name: 'open' },
    },
  },
];
const RULES: readonly ActionPolicyDecision[] = ['allow', 'adapter', 'report', 'block'];

const actions = useActions();
const rules = useActionsSettings((settings) => settings.policy.uri);
const log = ref<string[]>([]);
const note = (line: string) => {
  log.value = [line, ...log.value].slice(0, 6);
};

// Instead of opening a tab, the adapter notes the website it was given.
useActionsUiAdapter({ openUri: (uri) => note(`Your adapter got ${uri}`) });
useActionsEvent(
  (capability) => capability.onDiagnosticReported,
  ({ code, action }) => note(`The ${action} action was not run: ${code}`),
);

const run = (context: ActionContext) => actions.execute(websiteLink, context);
function setRule(origin: ActionOrigin, event: Event) {
  const rule = (event.target as HTMLSelectElement).value as ActionPolicyDecision;
  actions.updateSettings({ policy: { uri: { [origin]: rule } } });
}

// One click on load, so the log shows what a click does.
onMounted(() => {
  void run(STARTS[0].context);
});
</script>

<template>
  <section class="panel">
    <ul class="starts">
      <li v-for="{ label, context } in STARTS" :key="context.origin" class="start">
        <span class="start-label">
          {{ label }} <code>{{ context.origin }}</code>
        </span>
        <select
          class="field"
          :aria-label="`The rule for ${context.origin}`"
          :value="rules[context.origin]"
          @change="setRule(context.origin, $event)"
        >
          <option v-for="rule in RULES" :key="rule" :value="rule">{{ rule }}</option>
        </select>
        <button type="button" class="button" @click="run(context)">Run the link</button>
      </li>
    </ul>
    <div class="footer">
      <ol class="log" aria-live="polite">
        <li v-for="(line, index) in log" :key="log.length - index">{{ line }}</li>
      </ol>
      <button type="button" class="button" @click="actions.resetSettings()">
        Back to the registered rules
      </button>
    </div>
  </section>
</template>
