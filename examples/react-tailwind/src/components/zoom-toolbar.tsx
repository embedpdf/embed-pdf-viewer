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
      <div className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1">
        {/* Zoom Out Button */}
        <button
          onClick={handleZoomOut}
          className="rounded p-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          aria-label="Zoom out"
        >
          <SearchMinusIcon className="h-4 w-4" title="Zoom Out" />
        </button>

        {/* Zoom Percentage Display */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          <span>{zoomPercentage}%</span>
          <ChevronDownIcon
            className={`h-3 w-3 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Zoom In Button */}
        <button
          onClick={handleZoomIn}
          className="rounded p-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          aria-label="Zoom in"
        >
          <SearchPlusIcon className="h-4 w-4" title="Zoom In" />
        </button>
      </div>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} />

          {/* Menu */}
          <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {/* Zoom In/Out */}
            <button
              onClick={handleZoomIn}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <SearchPlusIcon className="h-4 w-4" title="Zoom In" />
              <span>Zoom In</span>
            </button>
            <button
              onClick={handleZoomOut}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <SearchMinusIcon className="h-4 w-4" title="Zoom Out" />
              <span>Zoom Out</span>
            </button>

            {/* Divider */}
            <div className="my-1 border-t border-gray-200" />

            {/* Zoom Presets */}
            {ZOOM_PRESETS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleSelectZoom(value)}
                className={`flex w-full items-center px-4 py-2 text-sm hover:bg-gray-100 ${
                  Math.abs(state.currentZoomLevel - value) < 0.01
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}

            {/* Divider */}
            <div className="my-1 border-t border-gray-200" />

            {/* Zoom Modes */}
            {ZOOM_MODES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleSelectZoom(value)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 ${
                  state.zoomLevel === value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                }`}
              >
                {value === ZoomMode.FitPage ? (
                  <FitPageIcon className="h-4 w-4" title="Fit to Page" />
                ) : (
                  <FitWidthIcon className="h-4 w-4" title="Fit to Width" />
                )}
                <span>{label}</span>
              </button>
            ))}

            {/* Divider */}
            <div className="my-1 border-t border-gray-200" />

            {/* Marquee Zoom */}
            <button
              onClick={handleToggleMarquee}
              className={`flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 ${
                state.isMarqueeZoomActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
              }`}
            >
              <MarqueeIcon className="h-4 w-4" title="Marquee Zoom" />
              <span>Marquee Zoom</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
