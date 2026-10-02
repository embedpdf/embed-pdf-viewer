<!--
  A text box: the field's picture at rest, an editor in the field's own font
  while focused. The editor is always mounted, see-through at rest: the DOM is
  the focus manager, so Tab reaches every field. Typing drafts (the plugin
  keeps the draft, so a download writes it), blur or Enter commits, Escape
  puts the value back: `@embedpdf/web`'s `createTextFieldEditor`.
-->
<script setup lang="ts">
import { computed, onUnmounted, shallowRef, watch } from 'vue';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
// The draft calls are the host lens's.
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { createTextFieldEditor, textFieldEditorStyleOf } from '@embedpdf/web';
import type { FormColors } from '@embedpdf/web';
import { useCapability } from '../runtime/capabilities';
import { useWidgetActivation } from './composables';
import { useWidgetBox } from './widget-box';

const props = defineProps<{
  item: Extract<FormWidgetItem, { control: 'text' }>;
  colors: FormColors;
}>();

const form = useCapability(FormHostToken);
const activate = useWidgetActivation(() => props.item.annotationRef);
const { element: box, frame, style: boxStyle } = useWidgetBox(
  () => props.item,
  () => props.colors,
);

// One editing policy per field: the layer keys this control by the field and
// its widget, so the field stays the same for the control's life.
const editor = createTextFieldEditor(form, props.item.fieldRef, props.item.value);
const state = shallowRef(editor.getState());
onUnmounted(editor.subscribe(() => (state.value = editor.getState())));
// Take the field's value whenever it changes under us; the editor keeps what's
// typed until the edit ends.
watch(
  () => props.item.value,
  (value) => editor.setValue(value),
);

const editorStyle = computed(() =>
  textFieldEditorStyleOf(props.item, frame.value, props.colors, state.value.focused),
);

const onInput = (event: Event) =>
  editor.input((event.target as HTMLInputElement | HTMLTextAreaElement).value);

function onKeydown(event: KeyboardEvent): void {
  if (editor.keyDown(event.key, props.item.multiline)) {
    (event.currentTarget as HTMLElement).blur();
  }
}
</script>

<template>
  <!--
    A click runs the widget's action too, as in Acrobat: the editor's focus
    click bubbles here, a read-only field's lands here directly.
  -->
  <div ref="box" :style="boxStyle" @click="activate">
    <textarea
      v-if="item.multiline"
      :value="state.draft"
      :maxlength="item.maxLength ?? undefined"
      :aria-label="item.label"
      :disabled="item.disabled"
      :style="editorStyle"
      @focus="editor.focus"
      @input="onInput"
      @blur="editor.blur"
      @keydown="onKeydown"
    />
    <input
      v-else
      :type="item.password ? 'password' : 'text'"
      :value="state.draft"
      :maxlength="item.maxLength ?? undefined"
      :aria-label="item.label"
      :disabled="item.disabled"
      :style="editorStyle"
      @focus="editor.focus"
      @input="onInput"
      @blur="editor.blur"
      @keydown="onKeydown"
    />
  </div>
</template>
