<!-- A checkbox drawn as a switch: it fills its frame and writes through `setValue`. -->
<script lang="ts">
  import type { FieldControlProps } from '../../src/form';

  let { widget, setValue, focused }: FieldControlProps = $props();

  const toggle = $derived(widget.control === 'toggle' ? widget : null);
</script>

{#if toggle}
  <button
    role="switch"
    aria-checked={toggle.checked}
    aria-label={toggle.label}
    data-focused={String(focused)}
    disabled={toggle.disabled}
    onclick={() => void setValue({ checked: !toggle.checked })}
    style="width: 100%; height: 100%"
  ></button>
{/if}
