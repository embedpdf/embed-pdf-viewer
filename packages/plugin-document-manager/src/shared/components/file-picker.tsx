import { ChangeEvent, useEffect, useRef } from '@framework';
import { useDocumentManagerCapability, useDocumentManagerPlugin } from '../hooks';
import { PdfErrorReason, Task } from '@embedpdf/models';
import { OpenDocumentResponse, OpenFileDialogOptions } from '@embedpdf/plugin-document-manager';

export function FilePicker() {
  const { plugin } = useDocumentManagerPlugin();
  const { provides } = useDocumentManagerCapability();
  const inputRef = useRef<HTMLInputElement>(null);
  const taskRef = useRef<Task<OpenDocumentResponse, PdfErrorReason> | null>(null);
  const optionsRef = useRef<OpenFileDialogOptions | undefined>(undefined);

  useEffect(() => {
    if (!plugin?.onOpenFileRequest) return;
    const unsub = plugin.onOpenFileRequest(({ task, options }) => {
      taskRef.current = task;
      optionsRef.current = options;
      inputRef.current?.click();
    });
    return unsub;
  }, [plugin]);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file || !provides) return;
    provides.fileSelected(file);
    const buffer = await file.arrayBuffer();
    const openTask = provides.openDocumentBuffer({
      name: file.name,
      buffer,
      documentId: optionsRef.current?.documentId,
      scale: optionsRef.current?.scale,
      rotation: optionsRef.current?.rotation,
      autoActivate: optionsRef.current?.autoActivate,
    });
    openTask.wait(
      (result) => {
        taskRef.current?.resolve(result);
      },
      (error) => {
        taskRef.current?.fail(error);
      },
    );
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
