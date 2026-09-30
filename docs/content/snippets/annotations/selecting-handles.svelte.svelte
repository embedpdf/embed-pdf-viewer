<script lang="ts">
  import { AnnotationLayer } from '@embedpdf/svelte/annotation';
</script>

<AnnotationLayer>
  {#snippet handle({ at, size, rotation })}
    <div
      class="my-handle"
      style:left="{at.x - size / 2}px"
      style:top="{at.y - size / 2}px"
      style:width="{size}px"
      style:height="{size}px"
      style:rotate="{rotation}deg"
    ></div>
  {/snippet}
  <!-- a rotationHandle snippet works the same way -->
</AnnotationLayer>
