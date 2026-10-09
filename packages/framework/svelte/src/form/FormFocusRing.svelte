<!--
  The focus ring of a field, painted above the field's picture and its see-through native
  control. An inset outline on the box itself would sit under an opaque child, so rectangular
  checkboxes and dropdowns would look unfocused while they are active in the native Tab order.
-->
<script lang="ts">
  import { cssText, formFocusRingStyleOf } from '@embedpdf/web';

  let {
    visible,
    color,
  }: {
    visible: boolean;
    /** The ring's CSS color: the form's `focus.color` setting, through its CSS variable. */
    color: string;
  } = $props();
</script>

{#if visible}
  <span
    aria-hidden="true"
    data-embedpdf-form-focus-ring=""
    style={cssText(formFocusRingStyleOf(color))}
  ></span>
{/if}
