<script lang="ts">
  import Search from './Search.svelte';
  import CloseIcon from './icons/CloseIcon.svelte';

  interface SearchSidebarProps {
    documentId: string;
    onClose: () => void;
  }

  let { documentId, onClose }: SearchSidebarProps = $props();
</script>

<div class="flex h-full w-80 flex-col border-l border-gray-300 bg-gray-50">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-gray-300 bg-white px-4 py-3">
    <h2 class="text-lg font-semibold text-gray-800">Search</h2>
    <button
      onclick={onClose}
      class="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      aria-label="Close search"
    >
      <CloseIcon class="h-5 w-5" />
    </button>
  </div>

  <!-- Search Content -->
  <div class="flex-1 overflow-hidden p-4">
    <Search {documentId} />
  </div>
</div>
