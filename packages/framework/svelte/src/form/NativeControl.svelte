<!--
  The layer's own control for one box, by what it is:

    text      → the picture at rest; focus shows an editor in the field's font.
    toggle    → the picture is the control; a click writes the toggled value.
    combo     → an invisible native <select> over the picture.
    list      → a visible native <select>: one surface owns the rows, the keyboard and the
                scrolling.
    button    → a native click target over the picture that runs its action.
    signature → "sign here", or the signed field's details, with the signature plugin.
-->
<script lang="ts">
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  import type { FormColors } from '@embedpdf/web';
  import ButtonControl from './ButtonControl.svelte';
  import ComboControl from './ComboControl.svelte';
  import ListControl from './ListControl.svelte';
  import SignatureControl from './SignatureControl.svelte';
  import TextControl from './TextControl.svelte';
  import ToggleControl from './ToggleControl.svelte';

  let { item, colors }: { item: FormWidgetItem; colors: FormColors } = $props();
</script>

{#if item.control === 'text'}
  <TextControl {item} {colors} />
{:else if item.control === 'toggle'}
  <ToggleControl {item} {colors} />
{:else if item.control === 'choice' && item.kind === 'list'}
  <ListControl {item} {colors} />
{:else if item.control === 'choice'}
  <ComboControl {item} {colors} />
{:else if item.control === 'button'}
  <ButtonControl {item} {colors} />
{:else if item.control === 'signature'}
  <SignatureControl {item} {colors} />
{/if}
