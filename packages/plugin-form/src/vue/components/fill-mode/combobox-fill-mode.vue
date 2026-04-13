<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PdfWidgetAnnoObject } from '@embedpdf/models';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/vue';
import { useFormWidgetState } from '../../hooks/use-form-widget-state';
import { useFormDocumentState } from '../../hooks/use-form';
import RenderWidget from '../render-widget.vue';
import ComboboxField from '../fields/combobox-field.vue';
import type { ComboboxFieldProps } from '../../../shared/components/types';

const props = defineProps<AnnotationRendererProps<PdfWidgetAnnoObject>>();
const ws = useFormWidgetState(props);
const { state: formState } = useFormDocumentState(() => props.documentId);

const wrapperEl = ref<HTMLDivElement | null>(null);
const selectEl = ref<HTMLElement | null>(null);

const isFocused = computed(() => formState.value.selectedFieldId === ws.annotation.value.id);

watch(isFocused, (focused) => {
  if (focused && wrapperEl.value && !wrapperEl.value.contains(document.activeElement)) {
    (selectEl.value ?? wrapperEl.value).focus();
  }
});

function handleFocus() {
  ws.scope.value?.selectField(ws.annotation.value.id);
}

function handleBlur() {
  requestAnimationFrame(() => {
    if (wrapperEl.value?.contains(document.activeElement)) return;
    if (ws.scope.value?.getSelectedFieldId() === ws.annotation.value.id) {
      ws.scope.value?.deselectField();
    }
  });
}

function selectInputRef(el: HTMLElement | null) {
  selectEl.value = el;
}
</script>

<template>
  <div
    ref="wrapperEl"
    @focus="handleFocus"
    @blur="handleBlur"
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
    <ComboboxField
      :annotation="ws.annotation.value as ComboboxFieldProps['annotation']"
      :scale="ws.scale.value"
      :pageIndex="ws.pageIndex.value"
      :isEditable="true"
      :onChangeField="ws.handleChangeField"
      :inputRef="selectInputRef"
    />
  </div>
</template>
