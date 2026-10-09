<!-- A renderer with a button: it says whether it takes the pointer. -->
<script lang="ts">
  import type { AnnotationRendererProps } from '../../src/annotation';

  let { interactive }: AnnotationRendererProps = $props();
</script>

<button data-testid="widget">{interactive ? 'live' : 'drawn'}</button>
