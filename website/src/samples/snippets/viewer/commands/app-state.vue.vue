<script setup lang="ts">
import { computed, ref } from 'vue';
import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-vue';

const CHECKS = ['Parties', 'Dates', 'Payment', 'Signatures'];

interface Review {
  done: string[];
  status: 'review' | 'approved';
  approve(): void;
}

// The commands read your state from `appState`, so nothing goes stale.
const config: ViewerConfig<Review> = {
  commands: [
    {
      id: 'acme:approve',
      label: 'Approve',
      icon: 'check',
      enabled: ({ appState }) => appState.done.length === CHECKS.length,
      active: ({ appState }) => appState.status === 'approved',
      run: ({ appState }) => appState.approve(),
    },
  ],
  layout: (layout) => layout.add('acme:approve', { to: 'main', section: 'end' }),
};

const done = ref<string[]>([]);
const status = ref<Review['status']>('review');
const appState = computed<Review>(() => ({
  done: done.value,
  status: status.value,
  approve: () => (status.value = 'approved'),
}));
</script>

<template>
  <fieldset>
    <label v-for="check in CHECKS" :key="check">
      <input v-model="done" type="checkbox" :value="check" /> {{ check }}
    </label>
  </fieldset>
  <PDFViewer src="/report.pdf" v-bind="config" :app-state="appState" style="height: 100vh" />
</template>
