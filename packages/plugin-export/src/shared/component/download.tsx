import { ignore } from '@embedpdf/models';
import { useEffect, useRef } from '@framework';

import { useExportCapability, useExportPlugin } from '../hooks';

export interface DownloadProps {
  fileName?: string;
}

export function Download(props: DownloadProps) {
  const { provides: exportCapability } = useExportCapability();
  const { plugin: exportPlugin } = useExportPlugin();
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!exportCapability) return;
    if (!exportPlugin) return;

    const unsub = exportPlugin.onRequest((action) => {
      if (action === 'download') {
        const el = ref.current;
        if (!el) return;

        const task = exportPlugin.saveAsCopyAndGetBufferAndName();
        task.wait(({ buffer, name }) => {
          const url = URL.createObjectURL(new Blob([buffer]));
          el.href = url;
          el.download = props.fileName ?? name;
          el.click();
          URL.revokeObjectURL(url);
        }, ignore);
      }
    });

    return unsub;
  }, [exportCapability, exportPlugin]);

  return <a style={{ display: 'none' }} ref={ref} />;
}
