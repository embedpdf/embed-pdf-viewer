<!--
  <DocumentView>: the document in scope, ready to read. A Stage with the page
  layers (picture, selection, search hits, links, annotations, form fields),
  Ctrl+C / Cmd+C copying, and the DocumentGate's fallback while nothing is
  ready. Size it with CSS (it fills its box). `#page` replaces the layers,
  `#fallback`, `#locked` and `#error` replace the waiting states.
-->
<script setup lang="ts">
import type { FailedDocumentInfo, LockedDocumentInfo } from '@embedpdf/core';
import type { PageContextValue } from '../runtime/page';
import DocumentGate from '../runtime/DocumentGate.vue';
import Stage from '../stage/Stage.vue';
import RenderLayer from '../render/RenderLayer.vue';
import SelectionLayer from '../selection/SelectionLayer.vue';
import SelectionClipboard from '../selection/SelectionClipboard.vue';
import SearchLayer from '../search/SearchLayer.vue';
import LinkLayer from '../link/LinkLayer.vue';
import AnnotationLayer from '../annotation/AnnotationLayer.vue';
import FormLayer from '../form/FormLayer.vue';

defineSlots<{
  page?(props: { page: PageContextValue }): unknown;
  fallback?(): unknown;
  locked?(props: { document: LockedDocumentInfo }): unknown;
  error?(props: { document: FailedDocumentInfo }): unknown;
}>();
</script>

<template>
  <DocumentGate>
    <template #fallback><slot name="fallback" /></template>
    <template v-if="$slots.locked" #locked="props"><slot name="locked" v-bind="props" /></template>
    <template v-if="$slots.error" #error="props"><slot name="error" v-bind="props" /></template>
    <SelectionClipboard />
    <Stage style="width: 100%; height: 100%">
      <template #page="props">
        <slot name="page" v-bind="props">
          <RenderLayer />
          <SelectionLayer />
          <SearchLayer />
          <LinkLayer />
          <AnnotationLayer />
          <FormLayer />
        </slot>
      </template>
    </Stage>
  </DocumentGate>
</template>
