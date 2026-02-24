import { useZoom } from '@embedpdf/plugin-zoom/react';
import { ZoomMode } from '@embedpdf/plugin-zoom';
import { useState } from 'react';
import {
  ChevronDownIcon,
  FitPageIcon,
  FitWidthIcon,
  SearchMinusIcon,
  SearchPlusIcon,
  MarqueeIcon,
} from './icons';
import { DropdownMenu, DropdownItem, DropdownDivider } from './ui';

interface ZoomToolbarProps {
  documentId: string;
}

interface ZoomPreset {
  value: number;
  label: string;
}

interface ZoomModeItem {
  value: ZoomMode;
  label: string;
}

const ZOOM_PRESETS: ZoomPreset[] = [
  { value: 0.5, label: '50%' },
  { value: 1, label: '100%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
  { value: 4, label: '400%' },
  { value: 8, label: '800%' },
];

const ZOOM_MODES: ZoomModeItem[] = [
  { value: ZoomMode.FitPage, label: 'Fit to Page' },
  { value: ZoomMode.FitWidth, label: 'Fit to Width' },
];

export function ZoomToolbar({ documentId }: ZoomToolbarProps) {
  const { state, provides } = useZoom(documentId);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!provides) return null;

  const zoomPercentage = Math.round(state.currentZoomLevel * 100);

  const handleZoomIn = () => {
    provides.zoomIn();
    setIsMenuOpen(false);
  };

  const handleZoomOut = () => {
    provides.zoomOut();
    setIsMenuOpen(false);
  };

  const handleSelectZoom = (value: number | ZoomMode) => {
    provides.requestZoom(value);
    setIsMenuOpen(false);
  };

  const handleToggleMarquee = () => {
    provides.toggleMarqueeZoom();
    setIsMenuOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1">
        {/* Zoom Out Button */}
        <button
          onClick={handleZoomOut}
          className="rounded p-1 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
          aria-label="Zoom out"
        >
          <SearchMinusIcon className="h-4 w-4" title="Zoom Out" />
        </button>

        {/* Zoom Percentage Display */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          <span>{zoomPercentage}%</span>
          <ChevronDownIcon
            className={`h-3 w-3 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Zoom In Button */}
        <button
          onClick={handleZoomIn}
          className="rounded p-1 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
          aria-label="Zoom in"
        >
          <SearchPlusIcon className="h-4 w-4" title="Zoom In" />
        </button>
      </div>

      <DropdownMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} className="w-48">
        <DropdownItem
          onClick={handleZoomIn}
          icon={<SearchPlusIcon className="h-4 w-4" title="Zoom In" />}
        >
          Zoom In
        </DropdownItem>
        <DropdownItem
          onClick={handleZoomOut}
          icon={<SearchMinusIcon className="h-4 w-4" title="Zoom Out" />}
        >
          Zoom Out
        </DropdownItem>

        <DropdownDivider />

        {/* Zoom Presets */}
        {ZOOM_PRESETS.map(({ value, label }) => (
          <DropdownItem
            key={value}
            onClick={() => handleSelectZoom(value)}
            isActive={Math.abs(state.currentZoomLevel - value) < 0.01}
          >
            {label}
          </DropdownItem>
        ))}

        <DropdownDivider />

        {/* Zoom Modes */}
        {ZOOM_MODES.map(({ value, label }) => (
          <DropdownItem
            key={value}
            onClick={() => handleSelectZoom(value)}
            icon={
              value === ZoomMode.FitPage ? (
                <FitPageIcon className="h-4 w-4" title="Fit to Page" />
              ) : (
                <FitWidthIcon className="h-4 w-4" title="Fit to Width" />
              )
            }
            isActive={state.zoomLevel === value}
          >
            {label}
          </DropdownItem>
        ))}

        <DropdownDivider />

        <DropdownItem
          onClick={handleToggleMarquee}
          icon={<MarqueeIcon className="h-4 w-4" title="Marquee Zoom" />}
          isActive={state.isMarqueeZoomActive}
        >
          Marquee Zoom
        </DropdownItem>
      </DropdownMenu>
    </div>
  );
}
