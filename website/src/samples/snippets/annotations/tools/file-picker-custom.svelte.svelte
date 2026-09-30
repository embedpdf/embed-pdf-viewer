<script lang="ts">
  import { useFilePickerProvider } from '@embedpdf/svelte/annotation';

  import { openStampLibrary } from './stamp-library';

  useFilePickerProvider(async ({ toolId, page, point }) => {
    if (toolId === 'stamp') return { data: await openStampLibrary() };
    return null;
  });
</script>

<div role="toolbar"><!-- your tools --></div>
