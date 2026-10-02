<!-- A renderer that only draws. -->
<script lang="ts">
  import type { AnnotationRendererProps } from '../../src/annotation';

  let { annotation }: AnnotationRendererProps = $props();
</script>

<span data-testid="drawn" data-kind={annotation.subtype}></span>
