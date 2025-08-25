import { ChangeEvent, useEffect, useRef } from '@framework';
import { useLoaderCapability } from '../hooks';

/** Wrap the viewer root */
export function FilePicker() {
  const { provides: cap } = useLoaderCapability(); // capability
  const inputRef = useRef<HTMLInputElement>(null);

  /* ─── listen for “open file” requests ─── */
  useEffect(() => {
    if (!cap) return;
    const unsub = cap.onOpenFileRequest((req) => {
      if (req === 'open' && inputRef.current) inputRef.current.click();
    });
    return unsub;
  }, [cap]);

  /* ─── handle actual file selection ─── */
  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (file && cap)
      await cap.loadDocument({
        type: 'buffer',
        pdfFile: {
          id: Math.random().toString(36).substring(2, 15),
          name: file.name,
          content: await file.arrayBuffer(),
        },
      });
  };

  return (
    <>
      {/* Hidden picker */}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={onChange}
      />
    </>
  );
}
