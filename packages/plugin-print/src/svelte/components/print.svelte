<script lang="ts">
  import { usePrintCapability, usePrintPlugin } from '../hooks';

  const printCapability = usePrintCapability();
  const printPlugin = usePrintPlugin();

  let iframeRef = $state<HTMLIFrameElement | null>(null);
  let urlRef: string | null = null;

  $effect(() => {
    if (!printCapability.provides || !printPlugin.plugin) return;

    const unsubscribe = printPlugin.plugin.onPrintRequest(({ buffer, task }) => {
      const iframe = iframeRef;
      if (!iframe) return;

      // cleanup old URL
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
      }

      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
      urlRef = url;

      iframe.onload = () => {
        if (iframe.src === url) {
          task.progress({ stage: 'iframe-ready', message: 'Ready to print' });
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          task.progress({ stage: 'printing', message: 'Print dialog opened' });
          task.resolve(buffer);
        }
      };

      iframe.src = url;
    });

    return () => {
      unsubscribe();
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
      }
    };
  });
</script>

<iframe
  bind:this={iframeRef}
  title="Print Document"
  src="about:blank"
  style="position: absolute; display: none;"
>
</iframe>
