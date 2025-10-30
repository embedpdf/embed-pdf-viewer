import { useState } from 'react';
import { useRotate } from '@embedpdf/plugin-rotate/react';
import { useSpread } from '@embedpdf/plugin-spread/react';
import { SpreadMode } from '@embedpdf/plugin-spread';
import {
  SettingsIcon,
  RotateRightIcon,
  RotateLeftIcon,
  SinglePageIcon,
  BookOpenIcon,
} from './icons';
import { ToolbarButton } from './toolbar-button';

type PageSettingsMenuProps = {
  documentId: string;
};

export function PageSettingsMenu({ documentId }: PageSettingsMenuProps) {
  const { provides: rotate } = useRotate(documentId);
  const { spreadMode, provides: spread } = useSpread(documentId);
  const [isOpen, setIsOpen] = useState(false);

  if (!rotate || !spread) return null;

  return (
    <div className="relative">
      <ToolbarButton
        onClick={() => setIsOpen(!isOpen)}
        isActive={isOpen}
        aria-label="Page Settings"
        title="Page Settings"
      >
        <SettingsIcon className="h-4 w-4" />
      </ToolbarButton>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

          {/* Menu */}
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {/* Page Orientation Section */}
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Page Orientation
            </div>

            <button
              onClick={() => {
                rotate.rotateForward();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              <RotateRightIcon className="h-4 w-4 flex-shrink-0" title="Rotate Clockwise" />
              <span>Rotate Clockwise</span>
            </button>

            <button
              onClick={() => {
                rotate.rotateBackward();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              <RotateLeftIcon className="h-4 w-4 flex-shrink-0" title="Rotate Counter-clockwise" />
              <span>Rotate Counter-clockwise</span>
            </button>

            {/* Divider */}
            <div className="my-1 border-t border-gray-200" />

            {/* Page Layout Section */}
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Page Layout
            </div>

            <button
              onClick={() => {
                spread.setSpreadMode(SpreadMode.None);
                setIsOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                spreadMode === SpreadMode.None ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
              }`}
            >
              <SinglePageIcon className="h-4 w-4 flex-shrink-0" title="Single Page" />
              <span>Single Page</span>
            </button>

            <button
              onClick={() => {
                spread.setSpreadMode(SpreadMode.Odd);
                setIsOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                spreadMode === SpreadMode.Odd ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
              }`}
            >
              <BookOpenIcon className="h-4 w-4 flex-shrink-0" title="Odd Pages" />
              <span>Odd Pages</span>
            </button>

            <button
              onClick={() => {
                spread.setSpreadMode(SpreadMode.Even);
                setIsOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                spreadMode === SpreadMode.Even ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
              }`}
            >
              <BookOpenIcon className="h-4 w-4 flex-shrink-0" title="Even Pages" />
              <span>Even Pages</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
