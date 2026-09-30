<script lang="ts">
  import { useAnnotationList } from '@embedpdf/svelte/annotation';

  const highlights = useAnnotationList({ subtype: 'highlight' });
</script>

<p>{highlights.current.length} highlights</p>
