import React from 'react';
import { Box, Typography } from '@mui/material';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { ThumbnailsPane, ThumbImg } from '@embedpdf/plugin-thumbnail/react';

export const Sidebar: React.FC = () => {
  const { state, provides } = useScroll();

  return (
    <ThumbnailsPane>
      {(m) => (
        <Box
          key={m.pageIndex}
          sx={{
            position: 'absolute',
            width: '100%',
            height: m.wrapperHeight,
            top: m.top,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '8px',
          }}
          onClick={() => {
            provides?.scrollToPage?.({
              pageNumber: m.pageIndex + 1,
            });
          }}
        >
          {/* Thumbnail box */}
          <Box
            sx={{
              width: m.width,
              height: m.height,
              border: '2px solid',
              borderColor: state.currentPage === m.pageIndex + 1 ? 'primary.main' : '#e0e0e0',
              borderRadius: 1,
              overflow: 'hidden',
              '&:hover': {
                borderColor: 'primary.main',
                boxShadow: 1,
              },
            }}
          >
            <ThumbImg
              meta={m}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </Box>

          {/* Page number label */}
          <Box
            sx={{
              height: m.labelHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mt: 0.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontSize: '0.75rem',
              }}
            >
              {m.pageIndex + 1}
            </Typography>
          </Box>
        </Box>
      )}
    </ThumbnailsPane>
  );
};
