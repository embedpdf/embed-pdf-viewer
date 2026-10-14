<!-- What the selection can change, with its current values. -->
<script lang="ts">
  import { useAnnotationProperties } from '@embedpdf/svelte/annotation';
  import Control from './Control.svelte';

  const panel = useAnnotationProperties();
</script>

{#if panel.current.properties.length === 0}
  <p class="panel empty">Select an annotation</p>
{:else}
  <dl class="panel properties">
    {#each panel.current.properties as property (property.key)}
      <div class="property">
        <dt>{property.label}</dt>
        <dd>
          <Control {property} />
        </dd>
      </div>
    {/each}
  </dl>
{/if}
