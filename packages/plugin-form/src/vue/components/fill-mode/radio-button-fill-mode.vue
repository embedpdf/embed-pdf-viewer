<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PdfWidgetAnnoObject } from '@embedpdf/models';
import { isWidgetChecked } from '@embedpdf/models';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/vue';
import { useFormWidgetState } from '../../hooks/use-form-widget-state';
import { useFormDocumentState } from '../../hooks/use-form';
import RenderWidget from '../render-widget.vue';

const props = defineProps<AnnotationRendererProps<PdfWidgetAnnoObject>>();
const ws = useFormWidgetState(props);
const { state: formState } = useFormDocumentState(() => props.documentId);

const wrapperEl = ref<HTMLDivElement | null>(null);

const isFocused = computed(() => formState.value.selectedFieldId === ws.annotation.value.id);

watch(isFocused, (focused) => {
  if (focused && wrapperEl.value && document.activeElement !== wrapperEl.value) {
    wrapperEl.value.focus();
  }
});

function selectRadio() {
  if (ws.isReadOnly.value) return;
  if (!isWidgetChecked(ws.annotation.value) && ws.annotation.value.exportValue) {
    ws.handleChangeField({ ...ws.field.value, value: ws.annotation.value.exportValue });
  }
}

function handleClick() {
  if (ws.isReadOnly.value) return;
  ws.scope.value?.selectField(ws.annotation.value.id);
  selectRadio();
}

function handleFocus() {
  if (ws.isReadOnly.value) return;
  ws.scope.value?.selectField(ws.annotation.value.id);
}

function handleBlur() {
  if (ws.scope.value?.getSelectedFieldId() === ws.annotation.value.id) {
    ws.scope.value?.deselectField();
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    selectRadio();
  }
}
</script>

<template>
  <div
    ref="wrapperEl"
    :tabindex="ws.isReadOnly.value ? -1 : 0"
    @click="handleClick"
    @focus="handleFocus"
    @blur="handleBlur"
    @keydown="handleKeyDown"
    :style="{
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      cursor: ws.isReadOnly.value ? 'default' : 'pointer',
      pointerEvents: 'auto',
      outline: isFocused ? '2px solid rgba(66, 133, 244, 0.8)' : 'none',
      outlineOffset: '-2px',
    }"
  >
    <RenderWidget
      :pageIndex="ws.pageIndex.value"
      :annotation="ws.annotation.value"
      :scaleFactor="ws.scale.value"
      :renderKey="ws.renderKey.value"
      :style="{ pointerEvents: 'none' }"
    />
  </div>
</template>
