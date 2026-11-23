<!-- A text box with a button at its end that empties it. `native` is the layer's own text box:
     the field as the PDF draws it, and the editor people type in. The button is yours. -->
<script lang="ts">
  import { useForm, type FieldControlProps } from '@embedpdf/svelte/form';

  let { widget, native, setValue }: FieldControlProps = $props();
  const form = useForm();

  // Empty the box, then put the cursor back in it, ready for the new value.
  const clear = () => setValue({ value: '' }).then(() => form.focus(widget.fieldRef));
</script>

{@render native()}
{#if widget.control === 'text' && !widget.disabled && widget.value !== ''}
  <!-- Tab goes to the text box. -->
  <button
    type="button"
    class="clear-button"
    aria-label="Clear {widget.label}"
    tabindex="-1"
    onclick={clear}
  ></button>
{/if}
