import { useEffect, useRef } from '@framework';
import { usePrintCapability, usePrintPlugin } from '../hooks';

export function PrintFrame() {
  const { provides: printCapability } = usePrintCapability();
  const { plugin: printPlugin } = usePrintPlugin();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!printCapability || !printPlugin) return;

    const unsubscribe = printPlugin.onPrintRequest(({ buffer, task }) => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      // cleanup old URL
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }

      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
      urlRef.current = url;

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
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
    };
  }, [printCapability, printPlugin]);

  return (
    <iframe
      ref={iframeRef}
      style={{ position: 'absolute', display: 'none' }}
      title="Print Document"
      src="about:blank"
    />
  );
}
