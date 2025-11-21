import { Paper, IconButton, Popper } from '@mui/material';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import DoneIcon from '@mui/icons-material/Done';
import { MenuWrapperProps } from '@embedpdf/utils/react';
import { useState } from 'react';
import { RedactionItem, useRedactionCapability } from '@embedpdf/plugin-redaction/react';

interface RedactionSelectionMenuProps {
  menuWrapperProps: MenuWrapperProps;
  selected: RedactionItem;
  documentId: string;
  container?: HTMLElement | null;
}

export function RedactionSelectionMenu({
  selected,
  documentId,
  container,
  menuWrapperProps,
}: RedactionSelectionMenuProps) {
  const { provides: redactionCapability } = useRedactionCapability();
  const [anchorEl, setAnchorEl] = useState<HTMLSpanElement | null>(null);

  // Get document-scoped API
  const redaction = redactionCapability?.forDocument(documentId);

  const handleDelete = () => {
    if (!redaction) return;
    const { page, id } = selected;
    redaction.removePending(page, id);
  };

  const handleCommit = () => {
    if (!redaction) return;
    const { page, id } = selected;
    redaction.commitPending(page, id);
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
          <IconButton size="small" onClick={handleCommit} aria-label="Commit redaction">
            <DoneIcon fontSize="small" />
          </IconButton>
        </Paper>
      </Popper>
    </>
  );
}
