<script lang="ts">
  import { useAnnotation, useAnnotationProperties } from '@embedpdf/svelte/annotation';
  import Control from './Control.svelte'; // your own control

  const annotation = useAnnotation();
  const panel = useAnnotationProperties(); // panel.current: { properties, values, mixed }
</script>

{#each panel.current.properties as property (property.key)}
  <Control
    {property}
    value={panel.current.values[property.key]}
    mixed={panel.current.mixed.includes(property.key)}
    onchange={(value: unknown) => annotation.selection.update({ [property.key]: value })}
  />
{/each}
