<script lang="ts">
  import { LinkLayer } from '@embedpdf/svelte/link';
</script>

<LinkLayer>
  {#snippet link({ link, native })}
    <span class="pdf-link" title={link.target.kind === 'uri' ? link.target.uri : undefined}>
      {@render native()}
    </span>
  {/snippet}
</LinkLayer>
