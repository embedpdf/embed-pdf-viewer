import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useZoom } from '@embedpdf/plugin-zoom/preact';
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

/**
 * Custom Zoom Toolbar
 *
 * A comprehensive zoom control with:
 * - Zoom in/out buttons
 * - Editable zoom percentage input
 * - Dropdown menu with zoom presets
 */
export function CustomZoomToolbar({ documentId }: CustomZoomToolbarProps) {
  const { state, provides } = useZoom(documentId);
  const [inputValue, setInputValue] = useState('');

  if (!provides) return null;

  const zoomPercentage = Math.round(state.currentZoomLevel * 100);

  // Sync input value with zoom state when it changes externally
  useEffect(() => {
    setInputValue(zoomPercentage.toString());
  }, [zoomPercentage]);

  const handleZoomChange = (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const value = parseFloat((formData.get('zoom') as string) || inputValue);

    if (!isNaN(value) && value > 0) {
      provides.requestZoom(value / 100);
    }
  };

  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    // Only allow numbers
    const value = target.value.replace(/[^0-9]/g, '');
    setInputValue(value);
  };

  const handleBlur = () => {
    // Reset to actual zoom if input is invalid
    if (!inputValue || parseFloat(inputValue) <= 0) {
      setInputValue(zoomPercentage.toString());
    }
  };

  return (
    <div className="relative">
      <div className="bg-interactive-hover flex items-center rounded">
        {/* Editable Zoom Percentage Input */}
        <form onSubmit={handleZoomChange} className="block mr-2">
          <input
            name="zoom"
            type="text"
            inputMode="numeric"
            pattern="\d*"
            className="h-6 w-8 border-0 bg-transparent p-0 text-right text-sm outline-none focus:outline-none"
            aria-label="Set zoom"
            autoFocus={false}
            value={inputValue}
            onInput={handleInputChange}
            onBlur={handleBlur}
          />
          <span className="text-sm">%</span>
        </form>
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
