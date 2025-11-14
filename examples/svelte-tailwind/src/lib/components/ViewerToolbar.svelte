<script lang="ts">
  import ZoomToolbar from './ZoomToolbar.svelte';
  import PanToggle from './PanToggle.svelte';
  import PageSettings from './PageSettings.svelte';
  import DocumentMenu from './DocumentMenu.svelte';
  import { SearchIcon, ThumbnailsIcon } from './icons';
  import { ToolbarButton, ToolbarDivider } from './ui';

  interface ViewerToolbarProps {
    documentId: string;
    onToggleSearch: () => void;
    onToggleThumbnails: () => void;
    isSearchOpen: boolean;
    isThumbnailsOpen: boolean;
  }

  let {
    documentId,
    onToggleSearch,
    onToggleThumbnails,
    isSearchOpen,
    isThumbnailsOpen,
  }: ViewerToolbarProps = $props();
</script>

<div class="flex items-center gap-2 border-b border-gray-300 bg-white px-3 py-2">
  <!-- Left side - Document menu and Thumbnails toggle -->
  <DocumentMenu {documentId} />
  <ToolbarDivider />
  <ToolbarButton
    onclick={onToggleThumbnails}
    isActive={isThumbnailsOpen}
    aria-label="Toggle thumbnails"
    title="Toggle Thumbnails"
  >
    <ThumbnailsIcon class="h-4 w-4" />
  </ToolbarButton>
  <PageSettings {documentId} />

  <!-- Center - Zoom toolbar -->
  <ToolbarDivider />
  <ZoomToolbar {documentId} />
  <ToolbarDivider />

  <PanToggle {documentId} />

  <div class="flex-1"></div>

  <!-- Right side - Search toggle -->
  <ToolbarButton
    onclick={onToggleSearch}
    isActive={isSearchOpen}
    aria-label="Toggle search"
    title="Toggle Search"
  >
    <SearchIcon class="h-4 w-4" />
  </ToolbarButton>
</div>
