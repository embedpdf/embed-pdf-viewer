import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useScrollCapability } from '@embedpdf/plugin-scroll/preact';
import { usePrintCapability } from '@embedpdf/plugin-print/preact';
import { PdfPrintOptions } from '@embedpdf/models';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { Spinner } from './ui/loading-indicator';

type PageSelection = 'all' | 'current' | 'custom';

interface PrintModalProps {
  documentId: string;
  isOpen?: boolean;
  onClose?: () => void;
  onExited?: () => void;
}

export function PrintModal({ documentId, isOpen, onClose, onExited }: PrintModalProps) {
  const { provides: scroll } = useScrollCapability();
  const { provides: printCapability } = usePrintCapability();

  const [selection, setSelection] = useState<PageSelection>('all');
  const [customPages, setCustomPages] = useState('');
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const scrollMetrics = scroll?.forDocument(documentId).getMetrics();
  const currentPage = scrollMetrics?.currentPage || 1;
  const totalPages = scroll?.forDocument(documentId).getTotalPages() || 0;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelection('all');
      setCustomPages('');
      setIncludeAnnotations(true);
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [isOpen]);

  const handlePrint = () => {
    let pageRange: string | undefined;

    if (selection === 'current') {
      pageRange = String(currentPage);
    } else if (selection === 'custom') {
      pageRange = customPages.trim() || undefined;
    }

    const options: PdfPrintOptions = {
      includeAnnotations,
      pageRange,
    };

    try {
      setIsLoading(true);
      setLoadingMessage('Preparing document...');

      const task = printCapability?.forDocument(documentId).print(options);

      if (task) {
        task.onProgress((progress) => {
          setLoadingMessage(progress.message);
        });

        task.wait(
          () => {
            setIsLoading(false);
            setLoadingMessage('');
            onClose?.();
          },
          (error) => {
            console.error('Print failed:', error);
            setIsLoading(false);
            setLoadingMessage('');
          },
        );
      }
    } catch (err) {
      console.error('Print failed:', err);
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const canSubmit = (selection !== 'custom' || customPages.trim().length > 0) && !isLoading;

  return (
    <Dialog
      open={isOpen ?? false}
      title="Print Settings"
      onClose={onClose}
      onExited={onExited}
      maxWidth="28rem"
    >
      <div className="space-y-6">
        {/* Pages to print */}
        <div>
          <label className="mb-3 block text-sm font-medium text-gray-700">Pages to print</label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="pageRange"
                value="all"
                checked={selection === 'all'}
                onChange={() => setSelection('all')}
                disabled={isLoading}
                className="mr-2"
              />
              <span className="text-sm">All pages</span>
            </label>

            <label className="flex items-center">
              <input
                type="radio"
                name="pageRange"
                value="current"
                checked={selection === 'current'}
                onChange={() => setSelection('current')}
                disabled={isLoading}
                className="mr-2"
              />
              <span className="text-sm">Current page ({currentPage})</span>
            </label>

            <label className="flex items-start">
              <input
                type="radio"
                name="pageRange"
                value="custom"
                checked={selection === 'custom'}
                onChange={() => setSelection('custom')}
                disabled={isLoading}
                className="mr-2 mt-0.5"
              />
              <div className="flex-1">
                <span className="mb-1 block text-sm">Specify pages</span>
                <input
                  type="text"
                  placeholder="e.g., 1-3, 5, 8-10"
                  value={customPages}
                  onInput={(e) => setCustomPages((e.target as HTMLInputElement).value)}
                  disabled={selection !== 'custom' || isLoading}
                  className={`w-full rounded-md border px-3 py-1 text-sm ${
                    selection !== 'custom' || isLoading
                      ? 'bg-gray-100 text-gray-500'
                      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  } focus:outline-none focus:ring-1`}
                />
                {selection === 'custom' && customPages.trim() && totalPages > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    Total pages in document: {totalPages}
                  </p>
                )}
              </div>
            </label>
          </div>
        </div>

        {/* Include annotations */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={includeAnnotations}
              onChange={(e) => setIncludeAnnotations((e.target as HTMLInputElement).checked)}
              disabled={isLoading}
              className="mr-2"
            />
            <span className="text-sm font-medium text-gray-700">Include annotations</span>
          </label>
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center space-x-3 rounded-md bg-blue-50 p-3">
            <Spinner className="text-blue-500" />
            <span className="text-sm text-blue-700">{loadingMessage}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-3 border-t border-gray-200 pt-4">
          <Button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!canSubmit}
            className="flex items-center space-x-2 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm text-white hover:!bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading && <Spinner size="sm" />}
            <span>{isLoading ? 'Printing...' : 'Print'}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
