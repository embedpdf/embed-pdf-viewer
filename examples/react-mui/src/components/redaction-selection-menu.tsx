import { Paper, IconButton, Popper } from '@mui/material';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import DoneIcon from '@mui/icons-material/Done';
import { useState } from 'react';
import {
  RedactionSelectionMenuProps,
  useRedactionCapability,
} from '@embedpdf/plugin-redaction/react';

interface Props extends RedactionSelectionMenuProps {
  documentId: string;
  container?: HTMLElement | null;
}

export function RedactionSelectionMenu({
  selected,
  context,
  documentId,
  container,
  menuWrapperProps,
}: Props) {
  const { provides: redactionCapability } = useRedactionCapability();
  const [anchorEl, setAnchorEl] = useState<HTMLSpanElement | null>(null);

  // Get document-scoped API
  const redaction = redactionCapability?.forDocument(documentId);

  const handleDelete = () => {
    if (!redaction) return;
    const { page, id } = context.item;
    redaction.removePending(page, id);
  };

  const handleCommit = () => {
    if (!redaction) return;
    const { page, id } = context.item;
    redaction.commitPending(page, id);
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
          <IconButton size="small" onClick={handleCommit} aria-label="Commit redaction">
            <DoneIcon fontSize="small" />
          </IconButton>
        </Paper>
      </Popper>
    </>
  );
}
