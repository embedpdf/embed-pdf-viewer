import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Typography,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useRedaction } from '@embedpdf/plugin-redaction/react';

interface SearchRedactionModalProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
}

export const SearchRedactionModal: React.FC<SearchRedactionModalProps> = ({
  open,
  onClose,
  documentId,
}) => {
  const { provides } = useRedaction(documentId);
  const [searchText, setSearchText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isRedacting, setIsRedacting] = useState(false);
  const [searchResults, setSearchResults] = useState<{ totalCount: number; foundOnPages: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!provides || !searchText.trim()) return;

    setIsSearching(true);
    setError(null);
    setSearchResults(null);

    try {
      const result = await provides.searchText(searchText, caseSensitive).toPromise();
      console.log('Search result:', result);
      setSearchResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleRedact = async () => {
    if (!provides || !searchText.trim()) return;

    setIsRedacting(true);
    setError(null);

    try {
      await provides.redactText(searchText, caseSensitive).toPromise();
      onClose();
      // Reset form
      setSearchText('');
      setCaseSensitive(false);
      setSearchResults(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redaction failed');
    } finally {
      setIsRedacting(false);
    }
  };

  const handleClose = () => {
    if (!isSearching && !isRedacting) {
      onClose();
      setSearchText('');
      setCaseSensitive(false);
      setSearchResults(null);
      setError(null);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Search & Redact Text</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            label="Search Text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSearching && !isRedacting && searchText.trim()) {
                handleSearch();
              }
            }}
            placeholder="Enter text to search for..."
            disabled={isSearching || isRedacting}
            sx={{ mb: 2 }}
            autoFocus
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                disabled={isSearching || isRedacting}
              />
            }
            label="Case sensitive"
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {searchResults && (
          <Box sx={{ mb: 2 }}>
            {searchResults.totalCount === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No matches found
              </Typography>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  Found {searchResults.totalCount} matches on {searchResults.foundOnPages?.length || 0} pages
                </Typography>
                {searchResults.foundOnPages && searchResults.foundOnPages.length > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Pages: {searchResults.foundOnPages.join(', ')}
                  </Typography>
                )}
              </>
            )}
          </Box>
        )}

        {(isSearching || isRedacting) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">
              {isSearching ? 'Searching...' : 'Applying redactions...'}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isSearching || isRedacting}>
          Cancel
        </Button>
        <Button
          onClick={handleSearch}
          disabled={!searchText.trim() || isSearching || isRedacting}
          variant="outlined"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </Button>
        <Button
          onClick={handleRedact}
          disabled={!searchResults || searchResults.totalCount === 0 || isSearching || isRedacting}
          variant="contained"
          color="error"
        >
          {isRedacting ? 'Redacting...' : `Redact All (${searchResults?.totalCount || 0})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};