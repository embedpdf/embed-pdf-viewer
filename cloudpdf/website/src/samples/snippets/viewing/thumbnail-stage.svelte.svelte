<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { ThumbsToken } from './thumbs-token';
</script>

<Stage token={ThumbsToken} interaction={false}>
  {#snippet page()}
    <RenderLayer />
  {/snippet}
</Stage>
