<script setup lang="ts">
import { DocumentGate, DocumentScope, useDocumentsState } from '@embedpdf/vue/runtime';
import { Stage } from '@embedpdf/vue/stage';
import { RenderLayer } from '@embedpdf/vue/render';
import Header from './Header.vue';

const { documents } = useDocumentsState();
</script>

<template>
  <div class="split">
    <section v-for="document in documents" :key="document.id" class="pane">
      <DocumentScope :id="document.id">
        <DocumentGate>
          <template #fallback><p class="loading">Opening…</p></template>
          <Header />
          <Stage class="stage">
            <template #page><RenderLayer /></template>
          </Stage>
        </DocumentGate>
      </DocumentScope>
    </section>
  </div>
</template>
