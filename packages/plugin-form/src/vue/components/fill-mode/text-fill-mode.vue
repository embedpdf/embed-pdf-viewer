<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PdfWidgetAnnoObject } from '@embedpdf/models';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/vue';
import { useFormWidgetState } from '../../hooks/use-form-widget-state';
import { useFormDocumentState } from '../../hooks/use-form';
import RenderWidget from '../render-widget.vue';
import TextField from '../fields/text-field.vue';
import type { TextFieldProps } from '../../../shared/components/types';

const props = defineProps<AnnotationRendererProps<PdfWidgetAnnoObject>>();
const ws = useFormWidgetState(props);
const { state: formState } = useFormDocumentState(() => props.documentId);

const editing = ref(false);
const inputEl = ref<HTMLElement | null>(null);

const isFocused = computed(() => formState.value.selectedFieldId === ws.annotation.value.id);

watch(isFocused, (focused) => {
  if (focused && inputEl.value && document.activeElement !== inputEl.value) {
    inputEl.value.focus();
  }
});

function handleFocus() {
  if (ws.isReadOnly.value) return;
  ws.scope.value?.selectField(ws.annotation.value.id);
  editing.value = true;
}

function handleBlur() {
  editing.value = false;
  if (ws.scope.value?.getSelectedFieldId() === ws.annotation.value.id) {
    ws.scope.value?.deselectField();
  }
}

function handleInputRef(el: HTMLElement | null) {
  inputEl.value = el;
}
</script>

<template>
  <div
    :style="{
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      position: 'relative',
      pointerEvents: 'auto',
      outline: 'none',
    }"
  >
    <RenderWidget
      :pageIndex="ws.pageIndex.value"
      :annotation="ws.annotation.value"
      :scaleFactor="ws.scale.value"
      :renderKey="ws.renderKey.value"
      :style="{
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        visibility: editing ? 'hidden' : 'visible',
      }"
    />
    <div
      :style="{
        position: 'absolute',
        inset: '0',
        zIndex: 1,
        opacity: editing ? 1 : 0,
      }"
    >
      <TextField
        :annotation="ws.annotation.value as TextFieldProps['annotation']"
        :scale="ws.scale.value"
        :pageIndex="ws.pageIndex.value"
        :isEditable="true"
        :onChangeField="ws.handleChangeField"
        :syncExternalValue="!editing"
        :onFocus="handleFocus"
        :onBlur="handleBlur"
        :inputRef="handleInputRef"
      />
    </div>
  </div>
</template>
