<script lang="ts">
  import { ignore } from '@embedpdf/models';
  import { useExportCapability, useExportPlugin } from '../hooks';

  const exportCapability = useExportCapability();
  const exportPlugin = useExportPlugin();

  let anchorElement: HTMLAnchorElement | undefined;

  $effect(() => {
    if (!exportCapability.provides) return;
    if (!exportPlugin.plugin) return;

    const unsub = exportPlugin.plugin.onRequest((event) => {
      const el = anchorElement;
      if (!el) return;

      const task = exportPlugin.plugin?.saveAsCopyAndGetBufferAndName(event.documentId);
      task?.wait(({ buffer, name }) => {
        const url = URL.createObjectURL(new Blob([buffer]));
        el.href = url;
        el.download = name;
        el.click();
        URL.revokeObjectURL(url);
      }, ignore);
    });

    return unsub;
  });
</script>

<a style="display: none" bind:this={anchorElement} href="/" aria-label="Download link"></a>
