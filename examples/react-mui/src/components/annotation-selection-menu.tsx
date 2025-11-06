import { Paper, IconButton, Popper } from '@mui/material';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { MenuWrapperProps } from '@embedpdf/utils/react';
import { useState } from 'react';

interface AnnotationSelectionMenuProps {
  menuWrapperProps: MenuWrapperProps;
  selected: TrackedAnnotation;
  documentId: string;
  container?: HTMLElement | null;
}

export function AnnotationSelectionMenu({
  selected,
  documentId,
  container,
  menuWrapperProps,
}: AnnotationSelectionMenuProps) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const [anchorEl, setAnchorEl] = useState<HTMLSpanElement | null>(null);

  // Get document-scoped API
  const annotation = annotationCapability?.forDocument(documentId);

  const handleDelete = () => {
    if (!annotation) return;
    const { pageIndex, id } = selected.object;
    annotation.deleteAnnotation(pageIndex, id);
  };

  return (
    <>
      <span {...menuWrapperProps} ref={setAnchorEl} />
      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="bottom"
        modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
        container={container ?? undefined}
      >
        <Paper
          elevation={2}
          sx={{
            px: 0.5,
            py: 0.25,
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            borderRadius: 1,
            cursor: 'default',
          }}
        >
          <IconButton size="small" onClick={handleDelete} aria-label="Delete annotation">
            <DeleteOutlineOutlinedIcon fontSize="small" />
          </IconButton>
        </Paper>
      </Popper>
    </>
  );
}
