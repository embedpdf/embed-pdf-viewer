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
import { ToolbarButton, DropdownMenu, DropdownSection, DropdownItem, DropdownDivider } from './ui';

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

      <DropdownMenu isOpen={isOpen} onClose={() => setIsOpen(false)} className="w-56">
        <DropdownSection title="Page Orientation">
          <DropdownItem
            onClick={() => {
              rotate.rotateForward();
              setIsOpen(false);
            }}
            icon={<RotateRightIcon className="h-4 w-4" title="Rotate Clockwise" />}
          >
            Rotate Clockwise
          </DropdownItem>
          <DropdownItem
            onClick={() => {
              rotate.rotateBackward();
              setIsOpen(false);
            }}
            icon={<RotateLeftIcon className="h-4 w-4" title="Rotate Counter-clockwise" />}
          >
            Rotate Counter-clockwise
          </DropdownItem>
        </DropdownSection>

        <DropdownDivider />

        <DropdownSection title="Page Layout">
          <DropdownItem
            onClick={() => {
              spread.setSpreadMode(SpreadMode.None);
              setIsOpen(false);
            }}
            icon={<SinglePageIcon className="h-4 w-4" title="Single Page" />}
            isActive={spreadMode === SpreadMode.None}
          >
            Single Page
          </DropdownItem>
          <DropdownItem
            onClick={() => {
              spread.setSpreadMode(SpreadMode.Odd);
              setIsOpen(false);
            }}
            icon={<BookOpenIcon className="h-4 w-4" title="Odd Pages" />}
            isActive={spreadMode === SpreadMode.Odd}
          >
            Odd Pages
          </DropdownItem>
          <DropdownItem
            onClick={() => {
              spread.setSpreadMode(SpreadMode.Even);
              setIsOpen(false);
            }}
            icon={<BookOpenIcon className="h-4 w-4" title="Even Pages" />}
            isActive={spreadMode === SpreadMode.Even}
          >
            Even Pages
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </div>
  );
}
