import { ZoomToolbar } from './zoom-toolbar';
import { PanToggleButton } from './pan-toggle';
import { PageSettingsMenu } from './page-settings-menu';
import { DocumentMenu } from './document-menu';
import { SearchIcon, ThumbnailsIcon } from './icons';
import { ToolbarButton } from './ui';
import { RedactionToolbar } from './redaction-toolbar';

export type ViewMode = 'view' | 'redact';

type ViewerToolbarProps = {
  documentId: string;
  onToggleSearch: () => void;
  onToggleThumbnails: () => void;
  isSearchOpen: boolean;
  isThumbnailsOpen: boolean;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
};

export function ViewerToolbar({
  documentId,
  onToggleSearch,
  onToggleThumbnails,
  isSearchOpen,
  isThumbnailsOpen,
  mode,
  onModeChange,
}: ViewerToolbarProps) {
  return (
    <>
      {/* Main Toolbar */}
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

        {/* Mode Tabs */}
        <div className="mx-4 flex flex-1 items-center justify-center">
          <div className="flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => onModeChange('view')}
              className={`rounded px-4 py-1 text-sm font-medium transition-colors ${
                mode === 'view'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              View
            </button>
            <button
              onClick={() => onModeChange('redact')}
              className={`rounded px-4 py-1 text-sm font-medium transition-colors ${
                mode === 'redact'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Redact
            </button>
          </div>
        </div>

        {/* Right side - Search toggle */}
        <ToolbarButton
          onClick={onToggleSearch}
          isActive={isSearchOpen}
          aria-label="Toggle search"
          title="Toggle Search"
        >
          <SearchIcon className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Redaction Toolbar */}
      {mode === 'redact' && <RedactionToolbar documentId={documentId} />}
    </>
  );
}
