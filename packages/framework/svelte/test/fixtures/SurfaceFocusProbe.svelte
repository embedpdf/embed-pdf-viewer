<!--
  Inputs that follow surfaces' focus requests, each with text in it: one always there, one that
  selects its text, and one only while its panel is open, as a panel draws its content.
-->
<script lang="ts">
  import { surfaceFocus, useSurface } from '../../src/shell';

  const panel = useSurface('panel');
</script>

<input data-field="search" value="contract" {@attach surfaceFocus('search')} />
<input data-field="notes" value="contract" {@attach surfaceFocus('notes', { select: true })} />
{#if panel.isOpen}
  <input data-field="panel" value="contract" {@attach surfaceFocus(() => 'panel')} />
{/if}
