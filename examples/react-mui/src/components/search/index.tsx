import { useSearch } from '@embedpdf/plugin-search/react';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Button,
  Checkbox,
  FormControlLabel,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  NavigateNext as NextIcon,
  NavigateBefore as PrevIcon,
} from '@mui/icons-material';
import { useState, useRef, useEffect } from 'react';
import { MatchFlag } from '@embedpdf/models';
import { useScrollCapability } from '@embedpdf/plugin-scroll/react';
import { SearchResult } from '@embedpdf/models';

interface SearchProps {
  documentId: string;
}

const HitLine = ({
  hit,
  onClick,
  active,
}: {
  hit: SearchResult;
  onClick: () => void;
  active: boolean;
}) => {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [active]);

  return (
    <Button
      ref={ref}
      variant="outlined"
      fullWidth
      onClick={onClick}
      sx={{
        justifyContent: 'flex-start',
        textAlign: 'left',
        textTransform: 'none',
        bgcolor: active ? 'primary.50' : 'background.paper',
        borderColor: active ? 'primary.main' : 'divider',
        '&:hover': {
          bgcolor: active ? 'primary.100' : 'action.hover',
        },
      }}
    >
      <Typography variant="body2">
        {hit.context.truncatedLeft && '… '}
        {hit.context.before}
        <Box component="span" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
          {hit.context.match}
        </Box>
        {hit.context.after}
        {hit.context.truncatedRight && ' …'}
      </Typography>
    </Button>
  );
};

export const Search = ({ documentId }: SearchProps) => {
  const { state, provides } = useSearch(documentId);
  const { provides: scrollCapability } = useScrollCapability();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(state.query || '');

  // Get document-scoped API
  const scroll = scrollCapability?.forDocument(documentId);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [provides]);

  useEffect(() => {
    if (inputValue === '') {
      provides?.stopSearch();
    } else {
      provides?.searchAllPages(inputValue);
    }
  }, [inputValue, provides]);

  useEffect(() => {
    if (state.activeResultIndex !== undefined && !state.loading) {
      scrollToItem(state.activeResultIndex);
    }
  }, [state.activeResultIndex, state.loading, state.query, state.flags]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleFlagChange = (flag: MatchFlag, checked: boolean) => {
    if (checked) {
      provides?.setFlags([...state.flags, flag]);
    } else {
      provides?.setFlags(state.flags.filter((f) => f !== flag));
    }
  };

  const clearInput = () => {
    setInputValue('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const scrollToItem = (index: number) => {
    const item = state.results[index];
    if (!item) return;

    const minCoordinates = item.rects.reduce(
      (min, rect) => ({
        x: Math.min(min.x, rect.origin.x),
        y: Math.min(min.y, rect.origin.y),
      }),
      { x: Infinity, y: Infinity },
    );

    scroll?.scrollToPage({
      pageNumber: item.pageIndex + 1,
      pageCoordinates: minCoordinates,
      alignX: 50,
      alignY: 50,
    });
  };

  const groupByPage = (results: typeof state.results) => {
    return results.reduce<Record<number, { hit: (typeof results)[0]; index: number }[]>>(
      (map, r, i) => {
        (map[r.pageIndex] ??= []).push({ hit: r, index: i });
        return map;
      },
      {},
    );
  };

  if (!provides) return null;

  const grouped = groupByPage(state.results);

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper' }}
    >
      <Box sx={{ p: 2 }}>
        <Box sx={{ position: 'relative' }}>
          <TextField
            inputRef={inputRef}
            fullWidth
            placeholder="Search"
            value={inputValue}
            onChange={handleInputChange}
            slotProps={{
              input: {
                startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
                endAdornment: inputValue && (
                  <IconButton size="small" onClick={clearInput}>
                    <ClearIcon />
                  </IconButton>
                ),
              },
            }}
            size="small"
          />
        </Box>

        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={state.flags.includes(MatchFlag.MatchCase)}
                onChange={(e) => handleFlagChange(MatchFlag.MatchCase, e.target.checked)}
                size="small"
              />
            }
            label="Case sensitive"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={state.flags.includes(MatchFlag.MatchWholeWord)}
                onChange={(e) => handleFlagChange(MatchFlag.MatchWholeWord, e.target.checked)}
                size="small"
              />
            }
            label="Whole word"
          />
        </Box>

        <Divider sx={{ my: 1 }} />

        {state.active && !state.loading && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              height: 32,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {state.total} results found
            </Typography>
            {state.total > 1 && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <IconButton size="small" onClick={() => provides.previousResult()}>
                  <PrevIcon />
                </IconButton>
                <IconButton size="small" onClick={() => provides.nextResult()}>
                  <NextIcon />
                </IconButton>
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', px: 2, pb: 2 }}>
        {state.loading ? (
          <Box
            sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}
          >
            <CircularProgress size={20} />
          </Box>
        ) : (
          Object.entries(grouped).map(([page, hits]) => (
            <Box key={page} sx={{ mt: 2 }}>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', py: 1, display: 'block' }}
              >
                Page {Number(page) + 1}
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {hits.map(({ hit, index }) => (
                  <HitLine
                    key={index}
                    hit={hit}
                    active={index === state.activeResultIndex}
                    onClick={() => provides.goToResult(index)}
                  />
                ))}
              </Box>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};
