<!-- A checkbox as a switch. A click fills the field in, as a click on the checkbox would. -->
<script lang="ts">
  import type { FieldControlProps } from '@embedpdf/svelte/form';

  let { widget, setValue }: FieldControlProps = $props();
</script>

{#if widget.control === 'toggle'}
  <button
    type="button"
    role="switch"
    class="switch"
    aria-checked={widget.checked}
    aria-label={widget.label}
    disabled={widget.disabled}
    onclick={() => setValue({ checked: !widget.checked })}
  ></button>
{/if}
