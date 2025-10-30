import { useState } from 'react';
import { useExport } from '@embedpdf/plugin-export/react';
import { MenuDotsIcon, PrintIcon, DownloadIcon } from './icons';
import { PrintDialog } from './print-dialog';
import { ToolbarButton } from './toolbar-button';

type DocumentMenuProps = {
  documentId: string;
};

export function DocumentMenu({ documentId }: DocumentMenuProps) {
  const { provides: exportProvider } = useExport(documentId);
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

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} />

            {/* Menu */}
            <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                onClick={handlePrint}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <PrintIcon className="h-4 w-4 flex-shrink-0" title="Print" />
                <span>Print</span>
              </button>

              <button
                onClick={handleDownload}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <DownloadIcon className="h-4 w-4 flex-shrink-0" title="Download" />
                <span>Download</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Print Dialog */}
      <PrintDialog
        documentId={documentId}
        isOpen={isPrintDialogOpen}
        onClose={() => setIsPrintDialogOpen(false)}
      />
    </>
  );
}
