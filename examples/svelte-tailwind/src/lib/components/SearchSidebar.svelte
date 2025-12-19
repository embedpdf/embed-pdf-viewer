<script lang="ts">
  import Search from './Search.svelte';

  interface SearchSidebarProps {
    documentId: string;
  }

  let { documentId }: SearchSidebarProps = $props();
</script>

<div class="flex h-full w-80 flex-col border-l border-gray-300 bg-gray-50">
  <!-- Search Content -->
  <div class="flex-1 overflow-hidden">
    <Search {documentId} />
  </div>
</div>
