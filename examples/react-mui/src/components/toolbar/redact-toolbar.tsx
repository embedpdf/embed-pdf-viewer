import { RedactionMode, useRedaction } from '@embedpdf/plugin-redaction/react';
import { AppBar, Divider, IconButton, Toolbar as MuiToolbar } from '@mui/material';
import DoneIcon from '@mui/icons-material/Done';
import ClearIcon from '@mui/icons-material/Clear';

import { ToggleIconButton } from '../toggle-icon-button';
import { RedactIcon, RedactAreaIcon } from '../../icons';

interface RedactToolbarProps {
  documentId: string;
}

export const RedactToolbar = ({ documentId }: RedactToolbarProps) => {
  const { provides, state } = useRedaction(documentId);

  const handleTextRedact = () => {
    provides?.toggleRedactSelection();
  };

  const handleAreaRedact = () => {
    provides?.toggleMarqueeRedact();
  };

  const handleCommitPending = () => {
    provides?.commitAllPending();
  };

  const handleClearPending = () => {
    provides?.clearPending();
  };

  return (
    <AppBar
      position="static"
      color="default"
      elevation={0}
      sx={{ borderBottom: '1px solid #cfd4da' }}
    >
      <MuiToolbar
        variant="dense"
        disableGutters
        sx={{ gap: 1.5, px: 1.5, justifyContent: 'center' }}
      >
        <ToggleIconButton
          tone="light"
          isOpen={state.activeType === RedactionMode.RedactSelection}
          onClick={handleTextRedact}
          aria-label="Redact text"
        >
          <RedactIcon fontSize="small" />
        </ToggleIconButton>
        <ToggleIconButton
          tone="light"
          isOpen={state.activeType === RedactionMode.MarqueeRedact}
          onClick={handleAreaRedact}
          aria-label="Redact area"
        >
          <RedactAreaIcon fontSize="small" />
        </ToggleIconButton>
        <Divider orientation="vertical" flexItem />
        <IconButton size="small" disabled={state.pendingCount === 0} onClick={handleCommitPending}>
          <DoneIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" disabled={state.pendingCount === 0} onClick={handleClearPending}>
          <ClearIcon fontSize="small" />
        </IconButton>
      </MuiToolbar>
    </AppBar>
  );
};
