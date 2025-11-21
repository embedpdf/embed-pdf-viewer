import { ignore } from '@embedpdf/models';
import { useEffect, useRef } from '@framework';

import { useExportPlugin } from '../hooks';

export function Download() {
  const { plugin: exportPlugin } = useExportPlugin();
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!exportPlugin) return;

    const unsub = exportPlugin.onRequest((event) => {
      const el = ref.current;
      if (!el) return;

      const task = exportPlugin.saveAsCopyAndGetBufferAndName(event.documentId);
      task.wait(({ buffer, name }) => {
        const url = URL.createObjectURL(new Blob([buffer]));
        el.href = url;
        el.download = name;
        el.click();
        URL.revokeObjectURL(url);
      }, ignore);
    });

    return unsub;
  }, [exportPlugin]);

  return <a style={{ display: 'none' }} ref={ref} />;
}
