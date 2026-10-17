<script lang="ts">
  import { surfaceFocus } from '@embedpdf/svelte/shell';
</script>

<!-- The cursor goes in the field when the panel asks for it, its text selected. -->
<input {@attach surfaceFocus('search', { select: true })} placeholder="Search" />
