import { ChangeEvent, useEffect, useRef } from '@framework';
import { useDocumentManagerCapability, useDocumentManagerPlugin } from '../hooks';

export function FilePicker() {
  const { plugin } = useDocumentManagerPlugin();
  const { provides } = useDocumentManagerCapability();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!plugin?.onOpenFileRequest) return;
    const unsub = plugin.onOpenFileRequest((req) => {
      if (req === 'open') inputRef.current?.click();
    });
    return unsub;
  }, [plugin]);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file || !provides) return;
    const buffer = await file.arrayBuffer();
    provides.openDocumentBuffer({
      name: file.name,
      buffer,
    });
  };

  return (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf"
      style={{ display: 'none' }}
      onChange={onChange}
    />
  );
}
