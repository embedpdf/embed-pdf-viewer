<script lang="ts">
  interface Props {
    documentId: string;
    tabId?: string;
    onClose?: () => void;
  }

  let { documentId, tabId, onClose }: Props = $props();
</script>

<div class="flex h-full flex-col">
  <div class="flex-1 overflow-auto p-4">
    <p class="text-sm text-gray-500">Outline view coming soon for document: {documentId}</p>
  </div>
</div>
