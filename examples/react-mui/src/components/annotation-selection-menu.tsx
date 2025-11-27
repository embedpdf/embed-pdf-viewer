import { Paper, IconButton, Popper } from '@mui/material';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import {
  AnnotationSelectionMenuProps,
  useAnnotationCapability,
} from '@embedpdf/plugin-annotation/react';
import { useState } from 'react';

interface Props extends AnnotationSelectionMenuProps {
  documentId: string;
  container?: HTMLElement | null;
}

export function AnnotationSelectionMenu({
  context,
  documentId,
  selected,
  container,
  menuWrapperProps,
}: Props) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const [anchorEl, setAnchorEl] = useState<HTMLSpanElement | null>(null);

  // Get document-scoped API
  const annotation = annotationCapability?.forDocument(documentId);

  const handleDelete = () => {
    if (!annotation) return;
    const { pageIndex, id } = context.annotation.object;
    annotation.deleteAnnotation(pageIndex, id);
  };

  return (
    <>
      <span {...menuWrapperProps} ref={setAnchorEl} />
      <Popper
        open={Boolean(anchorEl) && selected}
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
