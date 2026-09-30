<script lang="ts">
  import { LinkLayer, useLinkEvent } from '@embedpdf/svelte/link';
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { analytics } from './analytics';

  useLinkEvent(
    (link) => link.onActivated,
    ({ target }) => analytics.track('link_followed', { kind: target.kind }),
  );
</script>

<Stage>
  {#snippet page()}
    <RenderLayer />
    <LinkLayer />
  {/snippet}
</Stage>
