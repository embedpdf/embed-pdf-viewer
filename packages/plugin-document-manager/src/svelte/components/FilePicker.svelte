<script lang="ts">
  import { useDocumentManagerCapability, useDocumentManagerPlugin } from '../hooks';
  import type { Task } from '@embedpdf/models';
  import type { PdfErrorReason } from '@embedpdf/models';
  import type {
    OpenDocumentResponse,
    OpenFileDialogOptions,
  } from '@embedpdf/plugin-document-manager';

  const documentManagerPlugin = useDocumentManagerPlugin();
  const documentManagerCapability = useDocumentManagerCapability();

  let inputRef = $state<HTMLInputElement | null>(null);
  let taskRef = $state<Task<OpenDocumentResponse, PdfErrorReason> | null>(null);
  let optionsRef = $state<OpenFileDialogOptions | undefined>(undefined);

  $effect(() => {
    if (!documentManagerPlugin.plugin?.onOpenFileRequest) return;

    const unsubscribe = documentManagerPlugin.plugin.onOpenFileRequest(({ task, options }) => {
      taskRef = task;
      optionsRef = options;
      inputRef?.click();
    });

    return unsubscribe;
  });

  const onChange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file || !documentManagerCapability.provides) return;

    const buffer = await file.arrayBuffer();
    const openTask = documentManagerCapability.provides.openDocumentBuffer({
      name: file.name,
      buffer,
      documentId: optionsRef?.documentId,
      scale: optionsRef?.scale,
      rotation: optionsRef?.rotation,
      autoActivate: optionsRef?.autoActivate,
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
