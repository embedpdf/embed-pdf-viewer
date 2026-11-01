<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import {
  PDFViewer,
  Panel,
  Region,
  ToolbarItem,
  type Viewer,
  type ViewerConfig,
  type ViewerPlugins,
} from '@embedpdf/viewer-vue';
import BigButton from './BigButton.vue';
import { ICONS } from './icons';

import '../kiosk.css';

const forms = '/pdfs/forms.pdf';

type Form = ViewerPlugins['form'];

/** A question on the form: its field's name, and what the form calls it. */
interface Question {
  readonly name: string;
  readonly label: string;
}

/** How far along the form is: how many questions are required, and which of them are empty. */
interface Answers {
  readonly required: number;
  readonly missing: readonly Question[];
}

/** People fill in the form, and nothing else changes it. */
const FILLING_ONLY = { except: ['forms.filling'] };

/** The kinds of field people answer: not buttons or signatures. */
const ANSWERABLE = new Set(['text', 'checkbox', 'radio', 'combobox', 'listbox']);

const questionOf = (field: { name: string; alternateName: string | null }): Question => ({
  name: field.name,
  label: field.alternateName ?? field.name,
});

/** Whether a value from `exportValues()` is an answer: text, a choice, a ticked box. */
const isAnswer = (value: unknown) => (Array.isArray(value) ? value.length > 0 : Boolean(value));

const answersOf = (form: Form): Answers => ({
  required: form.list().filter((field) => field.required).length,
  missing: form.validate().missing.map(questionOf),
});

/** The first field after `after` with no answer yet, in the form's order, then from the top. */
function nextEmpty(form: Form, after: string | null) {
  const values = form.exportValues();
  const fields = form.list().filter((field) => ANSWERABLE.has(field.family) && !field.readOnly);
  const start = fields.findIndex((field) => field.name === after) + 1;
  return [...fields.slice(start), ...fields.slice(0, start)].find(
    (field) => !isAnswer(values[field.name]),
  );
}

/** Scroll to a field, so it sits a third of the way down. */
function reveal(viewer: Viewer, name: string) {
  const form = viewer.get('form');
  const box = form.list({ name })[0]?.widgets[0];
  const widget = box ? form.getWidget(box) : null;
  if (widget) {
    viewer.get('stage').reveal(widget.page, {
      rect: widget.rect,
      anchor: { y: 0.3 },
      behavior: 'smooth',
    });
  }
}

const viewer = shallowRef<Viewer | null>(null);
const answers = shallowRef<Answers | null>(null);
/** The header's line. */
const line = ref('Tap a box to answer it, or tap Next field.');
/** Whether the form is complete and handed in: it's locked until Clear. */
const sent = ref(false);
let last: string | null = null; // the field Next field went to

// The front desk's viewer: the form, a header and three big buttons, nothing else.
const config: ViewerConfig = {
  theme: {
    preference: 'light',
    accent: '#b5500e',
    tokens: {
      background: '#f3e7dc',
      surface: '#fffaf5',
      'surface-raised': '#fffaf5',
      text: '#2b1c12',
      'text-muted': '#6e5848',
      border: '#e3d5c9',
      hover: '#fdefe1',
      canvas: '#efe2d3',
      radius: '14px',
      font: "ui-rounded, 'SF Pro Rounded', 'Segoe UI', system-ui, sans-serif",
    },
  },
  // No opening, saving or printing files, no search, and no selecting text: a long press is only
  // ever a tap on the form.
  disable: ['documents', 'search', 'text'],
  plugins: {
    stage: { zoom: { mode: 'fit-width' } },
    form: { fields: { background: 'rgb(253 239 225 / 0.9)' } },
  },
  icons: ICONS,
  commands: [
    {
      id: 'kiosk:next',
      label: 'Next field',
      icon: 'next',
      run: ({ viewer }) => {
        if (sent.value) {
          line.value = 'This form is done. Tap Clear for the next person.';
          return;
        }
        const field = nextEmpty(viewer.get('form'), last);
        if (!field) {
          line.value = 'Every question has an answer. Tap Done.';
          return;
        }
        last = field.name;
        reveal(viewer, field.name);
        line.value = `Next: ${questionOf(field).label}`;
      },
    },
    {
      id: 'kiosk:clear',
      label: 'Clear',
      icon: 'clear',
      enabled: ({ get }) => Object.values(get('form').exportValues()).some(isAnswer),
      run: async ({ viewer }) => {
        sent.value = false;
        await viewer.get('form').reset();
        viewer.get('stage').goToPage(0);
        last = null;
        line.value = 'Cleared, ready for the next person.';
      },
    },
    {
      id: 'kiosk:done',
      label: 'Done',
      icon: 'done',
      run: ({ viewer }) => {
        const { valid } = viewer.get('form').validate();
        sent.value = valid;
        line.value = valid ? 'All done. Thank you!' : 'A few answers are still missing.';
        viewer.get('shell').open('kiosk-check');
      },
    },
  ],
  // A layout of its own: one bar at the bottom for the buttons, and the check as a sheet.
  layout: {
    bars: {
      kiosk: { place: 'bottom', center: [[{ custom: 'kiosk-actions' }]] },
    },
    panels: {
      'kiosk-check': { title: 'Your application', present: 'sheet', resizable: false },
    },
  },
};

// Follow the form as people fill it in, for the header and the check.
function onReady(ready: Viewer) {
  viewer.value = ready;
  ready.documents.onOpened(({ documentId }) => {
    const form = ready.forDocument(documentId).get('form');
    answers.value = answersOf(form);
    ready.watch(
      () => form.list(),
      () => (answers.value = answersOf(form)),
    );
  });
}

/** Close the check, and go to a question it lists. */
function pick({ name, label }: Question) {
  if (!viewer.value) return;
  viewer.value.get('shell').close('kiosk-check');
  reveal(viewer.value, name);
  line.value = `Next: ${label}`;
}
</script>

<template>
  <PDFViewer
    :src="forms"
    v-bind="config"
    :read-only="sent ? true : FILLING_ONLY"
    style="height: 100%"
    @ready="onReady"
  >
    <Region name="header">
      <header class="kiosk-header">
        <p class="kiosk-brand">Lanternfield <small>Front desk</small></p>
        <p class="kiosk-line" aria-live="polite">{{ line }}</p>
        <p
          v-if="answers && answers.required > 0"
          :class="answers.missing.length ? 'kiosk-progress' : 'kiosk-progress complete'"
        >
          {{ answers.required - answers.missing.length }} of {{ answers.required }} required
        </p>
      </header>
    </Region>
    <ToolbarItem id="kiosk-actions">
      <div class="kiosk-actions">
        <BigButton id="kiosk:next" />
        <BigButton id="kiosk:clear" />
        <BigButton id="kiosk:done" primary />
      </div>
    </ToolbarItem>
    <Panel id="kiosk-check">
      <div v-if="sent" class="kiosk-check">
        <h2>Thank you!</h2>
        <p>Your application is complete. Please hand the tablet back to the front desk.</p>
      </div>
      <div v-else class="kiosk-check">
        <h2>Almost there</h2>
        <p>These questions still need an answer:</p>
        <ul>
          <li v-for="question in answers?.missing" :key="question.name">
            <button type="button" @click="pick(question)">{{ question.label }}</button>
          </li>
        </ul>
      </div>
    </Panel>
  </PDFViewer>
</template>
