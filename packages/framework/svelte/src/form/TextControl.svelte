<!--
  A text box: the field's picture at rest, an editor in the field's own font while focused. The
  editor is always mounted, see-through at rest: the DOM is the focus manager, so Tab reaches
  every field. Typing drafts (the plugin keeps the draft, so a download writes it), blur or Enter
  commits, Escape puts the value back: `@embedpdf/web`'s `createTextFieldEditor`.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  // The draft calls are the host lens's.
  import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
  import {
    createTextFieldEditor,
    cssText,
    rectInPixels,
    textFieldEditorStyleOf,
  } from '@embedpdf/web';
  import type { FormColors } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import { useCapability } from '../runtime/readers.svelte';
  import { useWidgetActivation } from './widget';
  import WidgetBox from './WidgetBox.svelte';

  let {
    item,
    colors,
  }: { item: Extract<FormWidgetItem, { control: 'text' }>; colors: FormColors } = $props();

  const page = usePage();
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(() => item.annotationRef);

  // One editing policy per field: the layer keys this control by its document, field and
  // widget, so the field stays the same for the control's life.
  const editor = untrack(() => createTextFieldEditor(form, item.fieldRef, item.value));
  let editing = $state.raw(editor.getState());
  $effect(() => editor.subscribe(() => (editing = editor.getState())));
  // Take the field's value whenever it changes under us; the editor keeps what's typed until
  // the edit ends.
  $effect(() => editor.setValue(item.value));

  const editorStyle = $derived(
    cssText(
      textFieldEditorStyleOf(item, rectInPixels(item.box, page.transform), colors, editing.focused),
    ),
  );

  function onInput(event: Event & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) {
    editor.input(event.currentTarget.value);
  }

  function onKeyDown(
    event: KeyboardEvent & { currentTarget: HTMLInputElement | HTMLTextAreaElement },
  ) {
    if (editor.keyDown(event.key, item.multiline)) event.currentTarget.blur();
  }
</script>

<!--
  A click runs the widget's action too, as in Acrobat: the editor's focus click bubbles here, a
  read-only field's lands here directly.
-->
<WidgetBox {item} {colors} onclick={activate}>
  {#if item.multiline}
    <textarea
      value={editing.draft}
      maxlength={item.maxLength ?? undefined}
      aria-label={item.label}
      disabled={item.disabled}
      style={editorStyle}
      onfocus={editor.focus}
      oninput={onInput}
      onblur={editor.blur}
      onkeydown={onKeyDown}
    ></textarea>
  {:else}
    <input
      type={item.password ? 'password' : 'text'}
      value={editing.draft}
      maxlength={item.maxLength ?? undefined}
      aria-label={item.label}
      disabled={item.disabled}
      style={editorStyle}
      onfocus={editor.focus}
      oninput={onInput}
      onblur={editor.blur}
      onkeydown={onKeyDown}
    />
  {/if}
</WidgetBox>
