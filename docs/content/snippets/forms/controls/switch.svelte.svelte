<!-- FieldSwitch.svelte -->
<script lang="ts">
  import type { FieldControlProps } from '@embedpdf/svelte/form';

  let { widget, setValue }: FieldControlProps = $props();
</script>

<!-- It fills its frame (`width` and `height` 100% in your CSS), and turns with the field. -->
{#if widget.control === 'toggle'}
  <button
    role="switch"
    class="switch"
    aria-checked={widget.checked}
    aria-label={widget.label}
    disabled={widget.disabled}
    onclick={() => setValue({ checked: !widget.checked })}
  ></button>
{/if}
