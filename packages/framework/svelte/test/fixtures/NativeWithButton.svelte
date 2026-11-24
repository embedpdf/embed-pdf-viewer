<!-- A control that keeps the layer's own and adds a button after it. -->
<script lang="ts">
  import type { FieldControlProps } from '../../src/form';

  let { widget, native }: FieldControlProps = $props();
</script>

{@render native()}
<button type="button" aria-label="Pick for {widget.label}" tabindex="-1"></button>
