import { useState, useEffect } from 'react';
import { usePrint } from '@embedpdf/plugin-print/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import type { PdfPrintOptions } from '@embedpdf/models';
import { Dialog, DialogContent, DialogFooter, Button } from './ui';

type PageSelection = 'all' | 'current' | 'custom';

type PrintDialogProps = {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
};

export function PrintDialog({ documentId, isOpen, onClose }: PrintDialogProps) {
  const { provides: print } = usePrint(documentId);
  const { state: scrollState } = useScroll(documentId);

  const [selection, setSelection] = useState<PageSelection>('all');
  const [customPages, setCustomPages] = useState('');
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelection('all');
      setCustomPages('');
      setIncludeAnnotations(true);
      setIsLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = !isLoading && (selection !== 'custom' || customPages.trim().length > 0);

  const handlePrint = async () => {
    if (!print || !canSubmit) return;

    setIsLoading(true);

    let pageRange: string | undefined;

    if (selection === 'current') {
      pageRange = String(scrollState.currentPage);
    } else if (selection === 'custom') {
      pageRange = customPages.trim() || undefined;
    }

    const options: PdfPrintOptions = {
      includeAnnotations,
      pageRange,
    };

    try {
      const task = print.print(options);

      if (task) {
        task.wait(
          () => {
            onClose();
          },
          (error) => {
            console.error('Print failed:', error);
            setIsLoading(false);
          },
        );
      }
    } catch (err) {
      console.error('Print failed:', err);
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} title="Print Settings" maxWidth="28rem">
      <DialogContent>
        {/* Pages to print */}
        <div>
          <label className="mb-3 block text-sm font-medium text-gray-700">Pages to print</label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="selection"
                value="all"
                checked={selection === 'all'}
                onChange={(e) => setSelection(e.target.value as PageSelection)}
                className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">All pages</span>
            </label>

            <label className="flex items-center">
              <input
                type="radio"
                name="selection"
                value="current"
                checked={selection === 'current'}
                onChange={(e) => setSelection(e.target.value as PageSelection)}
                className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                Current page ({scrollState.currentPage})
              </span>
            </label>

            <label className="flex items-center">
              <input
                type="radio"
                name="selection"
                value="custom"
                checked={selection === 'custom'}
                onChange={(e) => setSelection(e.target.value as PageSelection)}
                className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Specify pages</span>
            </label>
          </div>

          {/* Custom page range input */}
          <div className="mt-3">
            <input
              type="text"
              value={customPages}
              onChange={(e) => setCustomPages(e.target.value)}
              placeholder="e.g., 1-3, 5, 8-10"
              disabled={selection !== 'custom'}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
            {customPages.trim() && scrollState.totalPages > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Total pages in document: {scrollState.totalPages}
              </p>
            )}
          </div>
        </div>

        {/* Include annotations */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={includeAnnotations}
              onChange={(e) => setIncludeAnnotations(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Include annotations</span>
          </label>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handlePrint} disabled={!canSubmit}>
          {isLoading ? 'Printing...' : 'Print'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
