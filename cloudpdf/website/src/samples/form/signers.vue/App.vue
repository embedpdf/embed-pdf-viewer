<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { signaturePlugin } from '@embedpdf/vue/signature';
import { cloudEngine } from '@cloudpdf/engine';
import { people, type Person } from './people';
import HandOver from './HandOver.vue';
import SignCard from './SignCard.vue';
import Toolbar from './Toolbar.vue';

import '../signers.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
  // An empty signature field becomes a button. With no key, a mark is drawn into the field.
  signaturePlugin(),
];

const loan: OpenInput = { kind: 'grant', grant: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const person = ref<Person>('sender');
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :scope="people[person].scope"
    :initial-documents="[{ source: loan, name: 'equipment-loan.pdf' }]"
  >
    <div class="toolbar">
      <span class="label">Open the form as</span>
      <div class="segments">
        <button
          v-for="(each, key) in people"
          :key="key"
          type="button"
          class="segment"
          :aria-pressed="person === key"
          @click="person = key"
        >
          {{ each.name }}
        </button>
      </div>
    </div>
    <HandOver :person="person" />
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <Toolbar :person="person" />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <AnnotationLayer />
          <FormLayer />
        </template>
        <template #overlay>
          <SignCard />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
