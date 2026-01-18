/** @jsxImportSource preact */
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { Spinner } from './ui/loading-indicator';
import { useRedaction } from '../hooks/use-redaction';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';

interface SearchRedactionModalProps {
  documentId: string;
  isOpen?: boolean;
  onClose: () => void;
  onExited?: () => void;
}

export function SearchRedactionModal({ documentId, isOpen, onClose, onExited }: SearchRedactionModalProps) {
  const { translate } = useTranslations(documentId);
  const { searchText, redactText } = useRedaction(documentId);

  const [searchTerm, setSearchTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isRedacting, setIsRedacting] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    count: number;
    pages: number[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    setError(null);
    setSearchResults(null);

    try {
      const results = await searchText(searchTerm, caseSensitive);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleRedact = async () => {
    if (!searchResults || searchResults.count === 0) return;

    setIsRedacting(true);
    setError(null);

    try {
      await redactText(searchTerm, caseSensitive);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redaction failed');
    } finally {
      setIsRedacting(false);
    }
  };

  const canSearch = searchTerm.trim() && !isSearching && !isRedacting;
  const canRedact = searchResults && searchResults.count > 0 && !isSearching && !isRedacting;

  return (
    <Dialog
      open={isOpen ?? false}
      title={translate('redaction.search')}
      onClose={onClose}
      onExited={onExited}
      className="max-w-md"
    >
      <div className="space-y-6">
        {/* Search input */}
        <div>
          <label className="text-fg-secondary mb-3 block text-sm font-medium">
            {translate('redaction.searchTerm')}
          </label>
          <input
            type="text"
            placeholder={translate('redaction.searchPlaceholder')}
            value={searchTerm}
            onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
            disabled={isSearching || isRedacting}
            className="w-full rounded-md border border-border-default bg-bg-input px-3 py-2 text-base text-fg-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Case sensitivity */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive((e.target as HTMLInputElement).checked)}
              disabled={isSearching || isRedacting}
              className="accent-accent mr-2"
            />
            <span className="text-fg-secondary text-sm font-medium">
              {translate('redaction.caseSensitive')}
            </span>
          </label>
        </div>

        {/* Search button */}
        <Button
          onClick={handleSearch}
          disabled={!canSearch}
          className="bg-accent text-fg-on-accent hover:!bg-accent-hover w-full rounded-md border border-transparent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSearching ? (
            <div className="flex items-center justify-center space-x-2">
              <Spinner size="sm" />
              <span>{translate('redaction.searching')}</span>
            </div>
          ) : (
            translate('redaction.search')
          )}
        </Button>

        {/* Search results */}
        {searchResults && (
          <div className="bg-bg-surface rounded-md border border-border-subtle p-4">
            <div className="text-fg-primary text-sm">
              <div className="mb-2">
                <strong>{translate('redaction.foundMatches', { params: { count: searchResults.count } })}</strong>
              </div>
              {searchResults.pages.length > 0 && (
                <div className="text-fg-secondary">
                  {translate('redaction.onPages')}: {searchResults.pages.join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-state-error-light text-state-error-dark rounded-md border border-state-error-border p-3 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="border-border-subtle flex justify-end space-x-3 border-t pt-4">
          <Button
            onClick={onClose}
            disabled={isSearching || isRedacting}
            className="border-border-default bg-bg-surface text-fg-secondary hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {translate('redaction.cancel')}
          </Button>
          <Button
            onClick={handleRedact}
            disabled={!canRedact}
            className="bg-accent text-fg-on-accent hover:!bg-accent-hover flex items-center space-x-2 rounded-md border border-transparent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRedacting && <Spinner size="sm" />}
            <span>
              {isRedacting
                ? translate('redaction.redacting')
                : translate('redaction.applyRedaction')
              }
            </span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}