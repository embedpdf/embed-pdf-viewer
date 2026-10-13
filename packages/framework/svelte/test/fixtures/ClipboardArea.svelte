<!--
  Copying bound to an element: `<SelectionClipboard target>` with the element from `bind:this`.
-->
<script lang="ts">
  import { SelectionClipboard } from '../../src/selection';

  let area: HTMLDivElement | undefined = $state();
</script>

<div bind:this={area} data-testid="area" tabindex="-1">
  <SelectionClipboard target={() => area} />
</div>
