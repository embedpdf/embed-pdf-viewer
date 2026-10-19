<!-- The keys work while focus is inside this viewer, so they leave the rest of the page alone. -->
<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { useCommandShortcuts } from '@embedpdf/svelte/commands';
  import KeyboardHelp from './KeyboardHelp.svelte';

  let area: HTMLDivElement | undefined = $state();
  useCommandShortcuts({ target: () => area });
</script>

<!-- A click anywhere in the viewer gives it focus, so its keys work while it has it:
     `tabindex="-1"` makes it a place for keys, not a stop in the Tab order. -->
<div bind:this={area} class="layout" tabindex="-1">
  <KeyboardHelp />
  <Stage class="stage">
    <RenderLayer />
  </Stage>
</div>
