<!-- TextBox.svelte -->
<script lang="ts">
  import type { FieldControlProps } from '@embedpdf/svelte/form';

  let { widget, native, setValue }: FieldControlProps = $props();
</script>

<!-- The layer's own text box, and a button at its end that empties it. -->
{@render native()}
{#if widget.control === 'text' && !widget.disabled && widget.value !== ''}
  <!-- Tab goes to the text box. -->
  <button
    class="clear-button"
    aria-label="Clear {widget.label}"
    tabindex="-1"
    onclick={() => setValue({ value: '' })}
  ></button>
{/if}
