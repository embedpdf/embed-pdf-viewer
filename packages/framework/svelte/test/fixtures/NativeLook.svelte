<!-- A renderer that keeps the layer's own drawing. -->
<script lang="ts">
  import type { AnnotationRendererProps } from '../../src/annotation';

  let { native }: AnnotationRendererProps = $props();
</script>

<span data-testid="look">{@render native()}</span>
