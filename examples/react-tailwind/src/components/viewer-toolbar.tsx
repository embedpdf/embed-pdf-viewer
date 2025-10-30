import { ZoomToolbar } from './zoom-toolbar';
import { PanToggleButton } from './pan-toggle';
import { PageSettingsMenu } from './page-settings-menu';
import { DocumentMenu } from './document-menu';
import { SearchIcon, ThumbnailsIcon } from './icons';
import { ToolbarButton } from './toolbar-button';

type ViewerToolbarProps = {
  documentId: string;
  onToggleSearch: () => void;
  onToggleThumbnails: () => void;
  isSearchOpen: boolean;
  isThumbnailsOpen: boolean;
};

export function ViewerToolbar({
  documentId,
  onToggleSearch,
  onToggleThumbnails,
  isSearchOpen,
  isThumbnailsOpen,
}: ViewerToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-300 bg-white px-3 py-2">
      {/* Left side - Thumbnails toggle */}
      <ToolbarButton
        onClick={onToggleThumbnails}
        isActive={isThumbnailsOpen}
        aria-label="Toggle thumbnails"
        title="Toggle Thumbnails"
      >
        <ThumbnailsIcon className="h-4 w-4" />
      </ToolbarButton>

      {/* Center - existing toolbar items */}
      <DocumentMenu documentId={documentId} />
      <PanToggleButton documentId={documentId} />
      <PageSettingsMenu documentId={documentId} />
      <ZoomToolbar documentId={documentId} />

      {/* Right side - Search toggle */}
      <div className="ml-auto">
        <ToolbarButton
          onClick={onToggleSearch}
          isActive={isSearchOpen}
          aria-label="Toggle search"
          title="Toggle Search"
        >
          <SearchIcon className="h-4 w-4" />
        </ToolbarButton>
      </div>
    </div>
  );
}
