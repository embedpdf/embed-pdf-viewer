<script lang="ts">
  import { useAnnotation, useSelectionFields } from '@embedpdf/svelte/annotation';
  import Control from './Control.svelte'; // your own control

  const annotation = useAnnotation();
  const panel = useSelectionFields(); // panel.current: { fields, values, mixed }
</script>

{#each panel.current.fields as field (field.key)}
  <Control
    {field}
    value={panel.current.values[field.key]}
    mixed={panel.current.mixed.includes(field.key)}
    onchange={(value) => annotation.selection.update({ [field.key]: value })}
  />
{/each}
