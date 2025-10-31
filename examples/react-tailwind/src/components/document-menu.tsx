import { useState } from 'react';
import { useExport } from '@embedpdf/plugin-export/react';
import { useCapture } from '@embedpdf/plugin-capture/react';
import { useFullscreen } from '@embedpdf/plugin-fullscreen/react';
import {
  MenuDotsIcon,
  PrintIcon,
  DownloadIcon,
  ScreenshotIcon,
  FullscreenIcon,
  FullscreenExitIcon,
} from './icons';
import { PrintDialog } from './print-dialog';
import { CaptureDialog } from './capture-dialog';
import { ToolbarButton, DropdownMenu, DropdownItem } from './ui';

type DocumentMenuProps = {
  documentId: string;
};

export function DocumentMenu({ documentId }: DocumentMenuProps) {
  const { provides: exportProvider } = useExport(documentId);
  const { provides: captureProvider } = useCapture(documentId);
  const { provides: fullscreenProvider, state: fullscreenState } = useFullscreen();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);

  if (!exportProvider) return null;

  const handleDownload = () => {
    exportProvider.download();
    setIsMenuOpen(false);
  };

  const handlePrint = () => {
    setIsMenuOpen(false);
    setIsPrintDialogOpen(true);
  };

  const handleScreenshot = () => {
    if (captureProvider) {
      captureProvider.toggleMarqueeCapture();
    }
    setIsMenuOpen(false);
  };

  const handleFullscreen = () => {
    fullscreenProvider?.toggleFullscreen();
    setIsMenuOpen(false);
  };

  return (
    <>
      <div className="relative">
        <ToolbarButton
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          isActive={isMenuOpen}
          aria-label="Document Menu"
          title="Document Menu"
        >
          <MenuDotsIcon className="h-4 w-4" />
        </ToolbarButton>

        <DropdownMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} className="w-48">
          <DropdownItem
            onClick={handleScreenshot}
            icon={<ScreenshotIcon className="h-4 w-4" title="Capture Area" />}
          >
            Capture Area
          </DropdownItem>
          <DropdownItem
            onClick={handlePrint}
            icon={<PrintIcon className="h-4 w-4" title="Print" />}
          >
            Print
          </DropdownItem>
          <DropdownItem
            onClick={handleDownload}
            icon={<DownloadIcon className="h-4 w-4" title="Download" />}
          >
            Download
          </DropdownItem>
          <DropdownItem
            onClick={handleFullscreen}
            icon={
              fullscreenState.isFullscreen ? (
                <FullscreenExitIcon className="h-4 w-4" title="Exit Fullscreen" />
              ) : (
                <FullscreenIcon className="h-4 w-4" title="Fullscreen" />
              )
            }
          >
            {fullscreenState.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </DropdownItem>
        </DropdownMenu>
      </div>

      {/* Print Dialog */}
      <PrintDialog
        documentId={documentId}
        isOpen={isPrintDialogOpen}
        onClose={() => setIsPrintDialogOpen(false)}
      />

      {/* Capture Dialog */}
      <CaptureDialog documentId={documentId} />
    </>
  );
}
