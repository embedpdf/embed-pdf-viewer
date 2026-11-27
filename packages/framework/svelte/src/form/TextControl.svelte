<!--
  A text box: the field's picture at rest, an editor in the field's own font while focused. The
  editor is always mounted, see-through at rest: the DOM is the focus manager, so Tab reaches
  every field. Typing drafts (the plugin keeps the draft, so a download writes it), blur or Enter
  commits, Escape puts the value back: `@embedpdf/web`'s `createTextFieldEditor`.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { FullAutoFill } from 'svelte/elements';
  import { FontsToken } from '@embedpdf/plugin-fonts';
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  // The draft calls are the host lens's.
  import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
  import {
    ariaDescriptionOf,
    autocompleteOf,
    createTextFieldEditor,
    cssText,
    rectInPixels,
    textFieldEditorStyleOf,
  } from '@embedpdf/web';
  import type { FormColors } from '@embedpdf/web';
  import { useFontMounts } from '../runtime/font-mounts.svelte';
  import { usePage } from '../runtime/page';
  import { useCapability, useOptionalSelector } from '../runtime/readers.svelte';
  import FieldPlaceholder from './FieldPlaceholder.svelte';
  import { useWidgetActivation } from './widget';
  import WidgetBox from './WidgetBox.svelte';

  let { item, colors }: { item: Extract<FormWidgetItem, { control: 'text' }>; colors: FormColors } =
    $props();

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

  // The text being typed, where the engine will draw it, in its fonts: again once they're found.
  const paintFonts = useOptionalSelector(FontsToken, (fonts) => fonts.getPaintFontsEpoch(), 0);
  const layout = $derived.by(() => {
    void paintFonts.current;
    return item.annotationRef ? form.getTextEditorLayout(item.annotationRef, editing.draft) : null;
  });
  useFontMounts(() => layout?.programs ?? []);

  const editorStyle = $derived(
    cssText(
      textFieldEditorStyleOf(
        item,
        rectInPixels(item.box, page.transform),
        colors,
        editing.focused,
        layout,
      ),
    ),
  );

  // What the field is for: the browser may offer the person's saved value, and a screen reader
  // hears what an empty box asks for. Both attributes are left out for a field without a purpose.
  const autocomplete = $derived(autocompleteOf(item.purpose) as FullAutoFill | undefined);

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
  read-only field's lands here directly. The placeholder is above the editor, which is opaque
  while focused, and gone with the first character typed. Its block follows the editor's with no
  blank between them: Svelte keeps a blank between two blocks as a text node, in every box.
-->
<WidgetBox {item} {colors} onclick={activate} title={item.hint ?? undefined}>
  {#if item.multiline}
    <textarea
      value={editing.draft}
      maxlength={item.maxLength ?? undefined}
      aria-label={item.label}
      {autocomplete}
      aria-placeholder={item.placeholder ?? undefined}
      {...ariaDescriptionOf(item.hint)}
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
      {autocomplete}
      aria-placeholder={item.placeholder ?? undefined}
      {...ariaDescriptionOf(item.hint)}
      disabled={item.disabled}
      style={editorStyle}
      onfocus={editor.focus}
      oninput={onInput}
      onblur={editor.blur}
      onkeydown={onKeyDown}
    />
  {/if}{#if item.placeholder !== null && editing.draft === ''}<FieldPlaceholder {item} />{/if}
</WidgetBox>
