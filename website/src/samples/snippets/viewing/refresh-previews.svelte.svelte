<script lang="ts">
  import { RenderLayer, useRenderEvent } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { refreshMyPreviews } from './previews';

  useRenderEvent(
    (render) => render.onInvalidated,
    ({ pages }) => refreshMyPreviews(pages),
  );
</script>

<Stage>
  <RenderLayer />
</Stage>
