import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useScrollCapability } from '@embedpdf/plugin-scroll/preact';
import { usePrintCapability } from '@embedpdf/plugin-print/preact';
import { PdfPrintOptions } from '@embedpdf/models';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { Spinner } from './ui/loading-indicator';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';

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
  const { translate } = useTranslations(documentId);

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
      setLoadingMessage(translate('print.loading'));

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
      title={translate('print.title')}
      onClose={onClose}
      onExited={onExited}
      maxWidth="32rem"
    >
      <div className="space-y-6">
        {/* Pages to print */}
        <div>
          <label className="text-fg-secondary mb-3 block text-sm font-medium">{translate('print.pages')}</label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="pageRange"
                value="all"
                checked={selection === 'all'}
                onChange={() => setSelection('all')}
                disabled={isLoading}
                className="accent-accent mr-2"
              />
              <span className="text-fg-primary text-sm">{translate('print.all')}</span>
            </label>

            <label className="flex items-center">
              <input
                type="radio"
                name="pageRange"
                value="current"
                checked={selection === 'current'}
                onChange={() => setSelection('current')}
                disabled={isLoading}
                className="accent-accent mr-2"
              />
              <span className="text-fg-primary text-sm">{translate('print.current', {params: {currentPage}})}</span>
            </label>

            <label className="flex items-start">
              <input
                type="radio"
                name="pageRange"
                value="custom"
                checked={selection === 'custom'}
                onChange={() => setSelection('custom')}
                disabled={isLoading}
                className="accent-accent mr-2 mt-0.5"
              />
              <div className="flex-1">
                <span className="text-fg-primary mb-1 block text-sm">{translate('print.specify')}</span>
                <input
                  type="text"
                  placeholder={translate('print.specifyEG')}
                  value={customPages}
                  onInput={(e) => setCustomPages((e.target as HTMLInputElement).value)}
                  disabled={selection !== 'custom' || isLoading}
                  className={`w-full rounded-md border px-3 py-1 text-base ${
                    selection !== 'custom' || isLoading
                      ? 'bg-interactive-disabled text-fg-muted'
                      : 'border-border-default bg-bg-input text-fg-primary focus:border-accent focus:ring-accent'
                  } focus:outline-none focus:ring-1`}
                />
                {selection === 'custom' && customPages.trim() && totalPages > 0 && (
                  <p className="text-fg-muted mt-1 text-xs">
                    {translate('print.current', {params: {totalPages}})}
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
              className="accent-accent mr-2"
            />
            <span className="text-fg-secondary text-sm font-medium">{translate('print.annotation')}</span>
          </label>
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="bg-state-info-light flex items-center space-x-3 rounded-md p-3">
            <Spinner className="text-accent" />
            <span className="text-accent text-sm">{loadingMessage}</span>
          </div>
        )}

        {/* Actions */}
        <div className="border-border-subtle flex justify-end space-x-3 border-t pt-4">
          <Button
            onClick={onClose}
            disabled={isLoading}
            className="border-border-default bg-bg-surface text-fg-secondary hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {translate('print.cancel')}
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!canSubmit}
            className="bg-accent text-fg-on-accent hover:!bg-accent-hover flex items-center space-x-2 rounded-md border border-transparent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading && <Spinner size="sm" />}
            <span>{isLoading ? translate('print.printing') : translate('print.print')}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
