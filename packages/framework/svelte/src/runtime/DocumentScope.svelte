<!--
  Binds everything inside to one document, for panes and side-by-side comparison: the readers and
  `use<Plugin>()` handles inside talk to `id`, not the active document.
-->
<script lang="ts">
  import { setDocumentScope } from './binding.svelte';
  import type { DocumentScopeProps } from './props';

  let { id, children }: DocumentScopeProps = $props();

  setDocumentScope(() => id);
</script>

{@render children?.()}
