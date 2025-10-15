import { useZoom } from '@embedpdf/plugin-zoom/react';
import { useInteractionManagerCapability } from '@embedpdf/plugin-interaction-manager/react';
import { ZoomMode } from '@embedpdf/plugin-zoom';
import { useState } from 'react';

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
  const { provides: interactionManager } = useInteractionManagerCapability();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!provides) return null;

  const zoomPercentage = Math.round(state.currentZoomLevel * 100);
  const isMarqueeActive =
    interactionManager?.forDocument(documentId).getActiveMode() === 'marqueeZoom';

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
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
            />
          </svg>
        </button>

        {/* Zoom Percentage Display */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          <span>{zoomPercentage}%</span>
          <svg
            className={`h-3 w-3 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Zoom In Button */}
        <button
          onClick={handleZoomIn}
          className="rounded p-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          aria-label="Zoom in"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
            />
          </svg>
        </button>
      </div>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} />

          {/* Menu */}
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {/* Zoom In/Out */}
            <button
              onClick={handleZoomIn}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                />
              </svg>
              <span>Zoom In</span>
            </button>
            <button
              onClick={handleZoomOut}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
                />
              </svg>
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
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8h16M4 16h16"
                    />
                  </svg>
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
                isMarqueeActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                />
              </svg>
              <span>Marquee Zoom</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
