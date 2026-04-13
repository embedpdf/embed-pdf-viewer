<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PdfWidgetAnnoObject } from '@embedpdf/models';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/vue';
import { useFormWidgetState } from '../../hooks/use-form-widget-state';
import { useFormDocumentState } from '../../hooks/use-form';
import RenderWidget from '../render-widget.vue';
import ListboxField from '../fields/listbox-field.vue';
import type { ListboxFieldProps } from '../../../shared/components/types';

const props = defineProps<AnnotationRendererProps<PdfWidgetAnnoObject>>();
const ws = useFormWidgetState(props);
const { state: formState } = useFormDocumentState(() => props.documentId);

const editing = ref(false);
const wrapperEl = ref<HTMLDivElement | null>(null);

const isFocused = computed(() => formState.value.selectedFieldId === ws.annotation.value.id);

watch(isFocused, (focused) => {
  if (focused && wrapperEl.value && !wrapperEl.value.contains(document.activeElement)) {
    wrapperEl.value.focus();
  }
});

function handleFocus() {
  if (ws.isReadOnly.value) return;
  ws.scope.value?.selectField(ws.annotation.value.id);
  editing.value = true;
}

function handleBlur() {
  requestAnimationFrame(() => {
    if (wrapperEl.value?.contains(document.activeElement)) return;
    editing.value = false;
    if (ws.scope.value?.getSelectedFieldId() === ws.annotation.value.id) {
      ws.scope.value?.deselectField();
    }
  });
}
</script>

<template>
  <div
    ref="wrapperEl"
    :tabindex="ws.isReadOnly.value ? -1 : 0"
    @focus="handleFocus"
    @blur="handleBlur"
    :style="{
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      cursor: ws.isReadOnly.value ? 'default' : 'pointer',
      pointerEvents: 'auto',
      outline: isFocused && !editing ? '2px solid rgba(66, 133, 244, 0.8)' : 'none',
      outlineOffset: '-2px',
    }"
  >
    <ListboxField
      :annotation="ws.annotation.value as ListboxFieldProps['annotation']"
      :scale="ws.scale.value"
      :pageIndex="ws.pageIndex.value"
      :isEditable="true"
      :onChangeField="ws.handleChangeField"
    />
    <RenderWidget
      v-if="!editing"
      :pageIndex="ws.pageIndex.value"
      :annotation="ws.annotation.value"
      :scaleFactor="ws.scale.value"
      :renderKey="ws.renderKey.value"
      :style="{ pointerEvents: 'none' }"
    />
  </div>
</template>
