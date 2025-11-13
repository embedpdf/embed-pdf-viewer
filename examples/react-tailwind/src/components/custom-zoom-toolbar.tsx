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
import { CommandButton } from './command-button';

/**
 * Custom Zoom Toolbar Component
 *
 * This component is designed to be registered with the UI plugin and used
 * as a custom component in the UI schema.
 *
 * Props:
 *   - documentId: The document ID (passed by the UI renderer)
 */
interface CustomZoomToolbarProps {
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

/**
 * Custom Zoom Toolbar
 *
 * A comprehensive zoom control with:
 * - Zoom in/out buttons
 * - Current zoom percentage display
 * - Dropdown menu with presets, modes, and marquee zoom
 */
export function CustomZoomToolbar({ documentId }: CustomZoomToolbarProps) {
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
      <div className="flex items-center rounded bg-gray-100 pl-2">
        {/* Zoom Percentage Display */}
        <span className="text-sm">{zoomPercentage}%</span>
        <CommandButton
          commandId="zoom:toggle-menu"
          documentId={documentId}
          itemId="zoom-menu-button"
        />
        {/* Zoom Out Button */}
        <CommandButton commandId="zoom:out" documentId={documentId} />
        {/* Zoom In Button */}
        <CommandButton commandId="zoom:in" documentId={documentId} />
      </div>
    </div>
  );
}
