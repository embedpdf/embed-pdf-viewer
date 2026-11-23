<!-- TextBox.svelte -->
<script lang="ts">
  import { useForm, type FieldControlProps } from '@embedpdf/svelte/form';

  let { widget, native, setValue }: FieldControlProps = $props();
  const form = useForm();

  // Empty the box, then put the cursor back in it, ready for the new value.
  const clear = () => setValue({ value: '' }).then(() => form.focus(widget.fieldRef));
</script>

<!-- The layer's own text box, and a button at its end that empties it. -->
{@render native()}
{#if widget.control === 'text' && !widget.disabled && widget.value !== ''}
  <!-- Tab goes to the text box. -->
  <button class="clear-button" aria-label="Clear {widget.label}" tabindex="-1" onclick={clear}
  ></button>
{/if}
