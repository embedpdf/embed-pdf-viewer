<script lang="ts">
  import { useDocumentManagerCapability, useDocumentManagerPlugin } from '../hooks';
  import type { Task } from '@embedpdf/models';
  import type { PdfErrorReason } from '@embedpdf/models';
  import type { OpenDocumentResponse } from '@embedpdf/plugin-document-manager';

  const { plugin } = useDocumentManagerPlugin();
  const { provides } = useDocumentManagerCapability();

  let inputRef = $state<HTMLInputElement | null>(null);
  let taskRef = $state<Task<OpenDocumentResponse, PdfErrorReason> | null>(null);

  $effect(() => {
    if (!plugin?.onOpenFileRequest) return;

    const unsubscribe = plugin.onOpenFileRequest((task) => {
      taskRef = task;
      inputRef?.click();
    });

    return unsubscribe;
  });

  const onChange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file || !provides) return;

    const buffer = await file.arrayBuffer();
    const openTask = provides.openDocumentBuffer({
      name: file.name,
      buffer,
    });

    openTask.wait(
      (result) => {
        taskRef?.resolve(result);
      },
      (error) => {
        taskRef?.fail(error);
      },
    );
  };
</script>

<input
  bind:this={inputRef}
  type="file"
  accept="application/pdf"
  style:display="none"
  onchange={onChange}
/>
