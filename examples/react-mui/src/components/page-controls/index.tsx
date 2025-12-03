import { useViewportCapability } from '@embedpdf/plugin-viewport/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { Box, IconButton, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState, useCallback } from 'react';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';

interface PageControlsProps {
  documentId: string;
}

export const PageControls = ({ documentId }: PageControlsProps) => {
  const { provides: viewportCapability } = useViewportCapability();
  const { provides: scrollCapability } = useScroll(documentId);

  // Get document-scoped APIs
  const viewport = viewportCapability?.forDocument(documentId);
  const currentPage = scrollCapability?.getCurrentPage() ?? 1;
  const totalPages = scrollCapability?.getTotalPages() ?? 0;
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [inputValue, setInputValue] = useState<string>(currentPage.toString());

  useEffect(() => {
    setInputValue(currentPage.toString());
  }, [currentPage]);

  const startHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      if (!isHovering) {
        setIsVisible(false);
      }
    }, 4000);
  }, [isHovering]);

  useEffect(() => {
    if (!viewport) return;

    return viewport.onScrollActivity((activity) => {
      if (activity) {
        setIsVisible(true);
        startHideTimer();
      }
    });
  }, [viewport, startHideTimer]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    setIsHovering(true);
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    startHideTimer();
  };

  const handlePageChange = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const pageStr = formData.get('page') as string;
    const page = parseInt(pageStr);

    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      scrollCapability?.scrollToPage?.({
        pageNumber: page,
      });
    }
  };

  const handlePreviousPage = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.blur();
    if (currentPage > 1) {
      scrollCapability?.scrollToPreviousPage?.();
    }
  };

  const handleNextPage = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.blur();
    if (currentPage < totalPages) {
      scrollCapability?.scrollToNextPage?.();
    }
  };

  return (
    <Box
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          bgcolor: '#f8f9fa',
          borderRadius: 1,
          border: '1px solid #cfd4da',
          p: 0.5,
        }}
      >
        <IconButton onClick={handlePreviousPage} disabled={currentPage === 1} size="small">
          <NavigateBeforeIcon />
        </IconButton>

        <form onSubmit={handlePageChange} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TextField
            name="page"
            value={inputValue}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9]/g, '');
              setInputValue(value);
            }}
            slotProps={{
              input: {
                inputProps: {
                  style: {
                    width: '32px',
                    height: '25px',
                    padding: '4px',
                    textAlign: 'center',
                    fontSize: '14px',
                  },
                },
              },
            }}
            variant="outlined"
            size="small"
          />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {totalPages}
          </Typography>
        </form>

        <IconButton onClick={handleNextPage} disabled={currentPage === totalPages} size="small">
          <NavigateNextIcon />
        </IconButton>
      </Box>
    </Box>
  );
};
